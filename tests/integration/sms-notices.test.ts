import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'

test('parent notices are sent only by admins and filtered by school and linked class', async t => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated migrated database.')
  Object.assign(process.env, { DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL, JWT_SECRET: 'parent-notices-test-secret-at-least-32-characters' })
  const { unscopedDb: root } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const { postAnnouncement, listAnnouncements, listParentAnnouncements } = await import('../../src/modules/announcements/service')
  const { createManagedStudent, updateManagedStudent } = await import('../../src/modules/students/management')
  const { parentWorkspaceGet, parentWorkspacePost } = await import('../../src/modules/parents/handlers')
  const { signParentToken } = await import('../../lib/auth/jwt')
  const suffix = randomUUID(), schoolIds: string[] = []
  try {
    const school = await root.school.create({ data: { name: 'Notices A', slug: `notices-a-${suffix}` } }); schoolIds.push(school.id)
    const foreign = await root.school.create({ data: { name: 'Notices B', slug: `notices-b-${suffix}` } }); schoolIds.push(foreign.id)
    const db = tenantClient(school.id)
    const admin = await root.user.create({ data: { schoolId: school.id, role: 'SCHOOL_ADMIN', fullName: 'Notice Admin', email: `admin-${suffix}@test.local`, passwordHash: 'unused' } })
    const teacher = await root.user.create({ data: { schoolId: school.id, role: 'TEACHER', fullName: 'Notice Teacher', email: `teacher-${suffix}@test.local`, passwordHash: 'unused' } })
    const ctx = { db, schoolId: school.id, session: { typ: 'staff' as const, userId: admin.id, role: 'SCHOOL_ADMIN' as const, schoolId: school.id } }
    const teacherCtx = { ...ctx, session: { ...ctx.session, userId: teacher.id, role: 'TEACHER' as const } }
    await db.academicSession.create({ data: { schoolId: school.id, name: '2026/2027', startDate: new Date('2026-09-01Z'), endDate: new Date('2027-07-31Z'), isCurrent: true } })
    const armA = await db.classArm.create({ data: { schoolId: school.id, level: 'PRIMARY1', name: 'A', formTeacherId: teacher.id } })
    const armB = await db.classArm.create({ data: { schoolId: school.id, level: 'PRIMARY1', name: 'B' } })
    const foreignArm = await root.classArm.create({ data: { schoolId: foreign.id, level: 'PRIMARY1', name: 'Other school' } })
    const one = await createManagedStudent(ctx, { regNumber: 'A01', fullName: 'Ada Child', classArmId: armA.id, guardianName: 'Ada Parent', guardianPhone: '08012345678' })
    await createManagedStudent(ctx, { regNumber: 'B01', fullName: 'Ben Child', classArmId: armB.id, guardianName: 'Ben Parent', guardianPhone: '08012345679' })
    const parentA = await db.parent.findFirstOrThrow({ where: { phone: '+2348012345678' } }), parentB = await db.parent.findFirstOrThrow({ where: { phone: '+2348012345679' } })
    const parentContext = (parentId: string) => ({ db, schoolId: school.id, session: { typ: 'parent' as const, parentId, schoolId: school.id, authVersion: 1 } })
    const a = parentContext(parentA.id), b = parentContext(parentB.id)
    const staffNotice = await postAnnouncement(ctx, { title: 'Staff meeting', body: 'Staff only', audience: 'ALL_STAFF' })
    const all = await postAnnouncement(ctx, { title: 'School update', body: 'All parents', audience: 'ALL_PARENTS' })
    const noticeA = await postAnnouncement(ctx, { title: 'Class A trip', body: 'Class A parents', audience: 'PARENT_CLASS_ARM', classArmId: armA.id })
    const noticeB = await postAnnouncement(ctx, { title: 'Class B trip', body: 'Class B parents', audience: 'PARENT_CLASS_ARM', classArmId: armB.id })

    await t.test('each parent receives general notices and notices for their own child’s class', async () => {
      assert.deepEqual(new Set((await listParentAnnouncements(a)).map(notice => notice.id)), new Set([all.id, noticeA.id]))
      assert.deepEqual(new Set((await listParentAnnouncements(b)).map(notice => notice.id)), new Set([all.id, noticeB.id]))
      await assert.rejects(listParentAnnouncements(a, staffNotice.id), { code: 'NOT_FOUND' })
      await assert.rejects(listParentAnnouncements(a, noticeB.id), { code: 'NOT_FOUND' })
      assert.deepEqual((await listAnnouncements(teacherCtx)).map(notice => notice.id), [staffNotice.id])
      assert.equal((await listAnnouncements(ctx)).length, 4)
    })

    await t.test('teachers and parents cannot post notices and foreign class IDs are rejected', async () => {
      await assert.rejects(postAnnouncement(teacherCtx, { title: 'No', body: 'No', audience: 'ALL_PARENTS' }), { code: 'FORBIDDEN' })
      await assert.rejects(postAnnouncement(ctx, { title: 'Foreign', body: 'No', audience: 'PARENT_CLASS_ARM', classArmId: foreignArm.id }), { code: 'NOT_FOUND' })
      const token = await signParentToken({ sub: parentA.id, schoolId: school.id, authVersion: 1 })
      const req = new NextRequest('http://sms.test/api/sms/parent/workspace/announcements', { headers: { authorization: `Bearer ${token}` } })
      const response = await parentWorkspaceGet(req, 'announcements')
      const result = await response.json()
      assert.equal(result.data.announcements.length, 2)
      await assert.rejects(parentWorkspacePost(req, 'announcements'), { code: 'NOT_FOUND' })
      await assert.rejects(listParentAnnouncements({ ...a, db: tenantClient(foreign.id), schoolId: foreign.id, session: { ...a.session, schoolId: foreign.id } }), { code: 'FORBIDDEN' })
    })

    await t.test('class-targeted access follows active guardian links', async () => {
      await updateManagedStudent(ctx, one.id, { guardianPhone: null })
      assert.deepEqual((await listParentAnnouncements(a)).map(notice => notice.id), [all.id])
      await db.parent.update({ where: { id: parentA.id }, data: { isActive: false } })
      await assert.rejects(listParentAnnouncements(a), { code: 'FORBIDDEN' })
    })
  } finally {
    for (const schoolId of schoolIds) {
      const where = { schoolId }
      await root.announcement.deleteMany({ where }); await root.parentStudent.deleteMany({ where }); await root.parent.deleteMany({ where }); await root.studentProfile.deleteMany({ where }); await root.enrollment.deleteMany({ where }); await root.classArm.deleteMany({ where }); await root.academicSession.deleteMany({ where }); await root.student.deleteMany({ where }); await root.user.deleteMany({ where }); await root.school.deleteMany({ where: { id: schoolId } })
    }
    await root.$disconnect()
  }
})
