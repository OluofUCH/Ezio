import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'

test('guardian profiles automatically provision one parent account per school and phone', async t => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated migrated database.')
  Object.assign(process.env, { DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL, JWT_SECRET: 'guardian-onboarding-test-secret-at-least-32-characters' })
  const { unscopedDb: root } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const { createManagedStudent, updateManagedStudent } = await import('../../src/modules/students/management')
  const { updateParent, parentChildren } = await import('../../src/modules/parents/service')
  const { verifyPassword } = await import('../../lib/auth/password')
  const { signStaffToken } = await import('../../lib/auth/jwt')
  const { staffWorkspacePost } = await import('../../src/modules/workspace/handlers')
  const suffix = randomUUID(), schoolIds: string[] = []
  try {
    async function schoolFixture(name: string) {
      const school = await root.school.create({ data: { name, slug: `${name}-${suffix}`.toLowerCase() } }); schoolIds.push(school.id)
      const admin = await root.user.create({ data: { schoolId: school.id, fullName: `${name} Admin`, email: `${name}-${suffix}@test.local`, role: 'SCHOOL_ADMIN', passwordHash: 'unused' } })
      const db = tenantClient(school.id)
      const session = await db.academicSession.create({ data: { schoolId: school.id, name: '2026/2027', startDate: new Date('2026-09-01Z'), endDate: new Date('2027-07-31Z'), isCurrent: true } })
      const arm = await db.classArm.create({ data: { schoolId: school.id, name: 'A', level: 'PRIMARY1' } })
      return { school, admin, db, session, arm, ctx: { db, schoolId: school.id, session: { typ: 'staff' as const, userId: admin.id, role: 'SCHOOL_ADMIN' as const, schoolId: school.id } } }
    }
    const a = await schoolFixture('Guardian-A'), b = await schoolFixture('Guardian-B')
    const profile = { dateOfBirth: '2018-04-03', gender: 'Female', address: 'Lagos', guardianName: 'Guardian One', guardianPhone: '08012345678', guardianEmail: 'guardian@example.test', guardianRelationship: 'Mother' }
    const first = await createManagedStudent(a.ctx, { regNumber: 'A01', fullName: 'Ada First', classArmId: a.arm.id, ...profile })
    const parent = await a.db.parent.findFirstOrThrow({ where: { phone: '+2348012345678' } })

    await t.test('one admission saves the student, profile, placement and default-PIN parent together', async () => {
      assert.equal(first.parentAccount.status, 'created')
      assert(await verifyPassword('1234', parent.pinHash))
      assert.equal((await a.db.studentProfile.findFirstOrThrow({ where: { studentId: first.id } })).guardianPhone, '+2348012345678')
      assert.equal(await a.db.enrollment.count({ where: { studentId: first.id, isCurrent: true } }), 1)
      assert.equal((await a.db.parentStudent.findFirstOrThrow({ where: { studentId: first.id, parentId: parent.id } })).fromGuardianProfile, true)
    })

    let secondId = ''
    await t.test('siblings share the account without resetting its PIN or changing another school', async () => {
      await updateParent(a.ctx, { parentId: parent.id, pin: '5566' })
      const second = await createManagedStudent(a.ctx, { regNumber: 'A02', fullName: 'Ada Second', classArmId: a.arm.id, ...profile, guardianPhone: '+234 801 234 5678' }); secondId = second.id
      assert.equal(second.parentAccount.status, 'linked')
      assert.equal(await a.db.parent.count(), 1)
      assert.equal(await a.db.parentStudent.count({ where: { parentId: parent.id, isActive: true } }), 2)
      assert(await verifyPassword('5566', (await a.db.parent.findFirstOrThrow({ where: { id: parent.id } })).pinHash))
      await createManagedStudent(b.ctx, { regNumber: 'B01', fullName: 'Foreign Child', classArmId: b.arm.id, ...profile })
      assert.notEqual((await b.db.parent.findFirstOrThrow()).id, parent.id)
      const children = await parentChildren({ db: a.db, schoolId: a.school.id, session: { typ: 'parent', parentId: parent.id, schoolId: a.school.id, authVersion: 2 } })
      assert.deepEqual(children.map(child => child.student.fullName), ['Ada First', 'Ada Second'])
    })

    await t.test('editing guardian details updates the child link without moving siblings', async () => {
      await updateManagedStudent(a.ctx, first.id, { guardianName: 'Guardian Two', guardianPhone: '08012345679' })
      assert.equal(await a.db.parentStudent.count({ where: { parentId: parent.id, isActive: true } }), 1)
      assert.equal((await a.db.parentStudent.findFirstOrThrow({ where: { parentId: parent.id, isActive: true } })).studentId, secondId)
      await updateParent(a.ctx, { parentId: parent.id, phone: '08012345670' })
      assert.equal((await a.db.studentProfile.findFirstOrThrow({ where: { studentId: secondId } })).guardianPhone, '+2348012345670')
      await updateManagedStudent(a.ctx, secondId, { address: 'Abuja' })
      assert.equal(await a.db.parent.count(), 2)
      assert(await verifyPassword('5566', (await a.db.parent.findFirstOrThrow({ where: { id: parent.id } })).pinHash))
    })

    await t.test('incomplete guardian profiles can be completed later and invalid admissions leave no partial records', async () => {
      const pending = await createManagedStudent(a.ctx, { regNumber: 'A03', fullName: 'Pending Child', classArmId: a.arm.id, guardianName: 'Guardian Three' })
      assert.equal(pending.parentAccount.status, 'incomplete')
      assert.equal(await a.db.parentStudent.count({ where: { studentId: pending.id } }), 0)
      assert.equal((await updateManagedStudent(a.ctx, pending.id, { guardianPhone: '08012345671' })).parentAccount.status, 'created')
      const before = await a.db.parent.count()
      await assert.rejects(createManagedStudent(a.ctx, { regNumber: 'INVALID', fullName: 'Invalid Child', classArmId: a.arm.id, ...profile, dateOfBirth: '2099-01-01' }), { code: 'CONFLICT' })
      assert.equal(await a.db.student.count({ where: { regNumber: 'INVALID' } }), 0)
      assert.equal(await a.db.parent.count(), before)
    })

    await t.test('manual parent creation and child-link API actions are retired', async () => {
      const token = await signStaffToken({ sub: a.admin.id, role: 'SCHOOL_ADMIN', schoolId: a.school.id })
      for (const body of [{ fullName: 'Manual Parent', phone: '08012345672', pin: '1234', studentId: first.id }, { op: 'link', parentId: parent.id, studentId: first.id, isActive: true }]) {
        const req = new NextRequest('http://sms.test/api/sms/staff/workspace/parents', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
        await assert.rejects(staffWorkspacePost(req, 'parents'), { code: 'FORBIDDEN' })
      }
    })
  } finally {
    for (const schoolId of schoolIds) {
      const where = { schoolId }
      await root.parentComment.deleteMany({ where }); await root.parentStudent.deleteMany({ where }); await root.parent.deleteMany({ where }); await root.studentProfile.deleteMany({ where }); await root.enrollment.deleteMany({ where }); await root.classArm.deleteMany({ where }); await root.academicSession.deleteMany({ where }); await root.student.deleteMany({ where }); await root.user.deleteMany({ where }); await root.school.deleteMany({ where: { id: schoolId } })
    }
    await root.$disconnect()
  }
})
