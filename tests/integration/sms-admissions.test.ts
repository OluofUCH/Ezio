import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'
import type { ScopedStaffContext } from '../../lib/auth/session'
import { ROSTER_HEADERS } from '../../lib/import/students-csv'

test('form-teacher admissions and complete roster imports enforce class and guardian boundaries', async t => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated migrated database.')
  Object.assign(process.env, { DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL, JWT_SECRET: 'admissions-test-secret-at-least-32-characters' })
  const { unscopedDb: root } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const { createManagedStudent } = await import('../../src/modules/students/management')
  const { createRosterStudents } = await import('../../src/modules/students/service')
  const { signStaffToken } = await import('../../lib/auth/jwt')
  const { hashPassword, verifyPassword } = await import('../../lib/auth/password')
  const workspace = await import('../../app/(sms)/api/sms/staff/workspace/[area]/route')
  const legacyImport = await import('../../app/api/students/import/route')
  const legacyStudents = await import('../../app/api/students/route')
  const parentLogin = await import('../../app/api/auth/parent/login/route')
  const suffix = randomUUID(), schoolIds: string[] = []
  const profile = { dateOfBirth: '2013-04-03', gender: 'Female', address: '12 School Road, Lagos', guardianName: 'Guardian One', guardianRelationship: 'Mother', guardianPhone: '08012345678', guardianEmail: 'guardian@example.test' }
  async function call(area: string, token: string, method = 'GET', body?: unknown, query = '') {
    const req = new NextRequest(`http://sms.test/api/sms/staff/workspace/${area}${query}`, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const response = await workspace[method === 'GET' ? 'GET' : 'POST'](req, { params: Promise.resolve({ area }) })
    return { status: response.status, body: await response.json() }
  }
  function csv(rows: Record<string, string>[]) {
    return [ROSTER_HEADERS.join(','), ...rows.map(row => ROSTER_HEADERS.map(header => {
      const value = row[header] ?? ''
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
    }).join(','))].join('\r\n')
  }
  async function upload(token: string, rows: Record<string, string>[], dryRun = false, legacy = false) {
    const form = new FormData(); form.set('file', new File([csv(rows)], 'roster.csv', { type: 'text/csv' }))
    const req = new NextRequest(`http://sms.test${legacy ? '/api/students/import' : '/api/sms/staff/workspace/students-import'}?dryRun=${dryRun}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form })
    const response = legacy ? await legacyImport.POST(req, { params: Promise.resolve({}) }) : await workspace.POST(req, { params: Promise.resolve({ area: 'students-import' }) })
    return { status: response.status, body: await response.json() }
  }
  try {
    async function fixture(name: string) {
      const school = await root.school.create({ data: { name, slug: `${name}-${suffix}`.toLowerCase() } }); schoolIds.push(school.id)
      const db = tenantClient(school.id)
      async function staff(label: string, role: 'SCHOOL_ADMIN' | 'TEACHER') {
        const user = await db.user.create({ data: { schoolId: school.id, fullName: label, email: `${name}-${label}-${suffix}@test.local`.replaceAll(' ', '-'), role, passwordHash: 'unused' } })
        const ctx: ScopedStaffContext = { db, schoolId: school.id, session: { typ: 'staff', userId: user.id, role, schoolId: school.id } }
        return { user, ctx, token: await signStaffToken({ sub: user.id, role, schoolId: school.id }) }
      }
      const admin = await staff('School Admin', 'SCHOOL_ADMIN'), form = await staff('Form Teacher', 'TEACHER'), subject = await staff('Subject Teacher', 'TEACHER')
      const session = await db.academicSession.create({ data: { schoolId: school.id, name: '2026/2027', startDate: new Date('2026-09-01Z'), endDate: new Date('2027-07-31Z'), isCurrent: true } })
      const own = await db.classArm.create({ data: { schoolId: school.id, level: 'JSS1', name: 'A', formTeacherId: form.user.id } })
      const other = await db.classArm.create({ data: { schoolId: school.id, level: 'JSS1', name: 'B', isDefault: true } })
      const second = await db.classArm.create({ data: { schoolId: school.id, level: 'SS1', name: 'C', formTeacherId: form.user.id, isDefault: true } })
      const maths = await db.subject.create({ data: { schoolId: school.id, name: 'Mathematics', normalizedName: 'mathematics' } })
      for (const teacher of [form, subject]) await db.teachingAssignment.create({ data: { schoolId: school.id, teacherId: teacher.user.id, classArmId: other.id, academicSessionId: session.id, subjectId: maths.id } })
      return { school, db, session, own, other, second, admin, form, subject }
    }
    const a = await fixture('Admission-A'), b = await fixture('Admission-B')
    let admittedId = ''
    await t.test('a form teacher admits into each assigned arm and provisions guardian access atomically', async () => {
      const result = await call('students', a.form.token, 'POST', { regNumber: 'FORM01', fullName: 'Form Child One', classArmId: a.own.id, pin: '001234', ...profile })
      assert.equal(result.status, 201)
      admittedId = result.body.data.student.id
      assert.equal(result.body.data.student.parentAccount.status, 'created')
      assert.equal(result.body.data.student.pin, '001234')
      const stored = await a.db.student.findFirstOrThrow({ where: { id: admittedId }, include: { profile: true, enrollments: true } })
      assert.equal(stored.classLevel, 'JSS1')
      assert.equal(stored.enrollments[0]!.classArmId, a.own.id)
      assert.equal(stored.enrollments[0]!.academicSessionId, a.session.id)
      assert.equal(stored.profile!.dateOfBirth!.toISOString().slice(0, 10), profile.dateOfBirth)
      assert.equal(stored.profile!.guardianPhone, '+2348012345678')
      assert.equal(stored.profile!.guardianEmail, profile.guardianEmail)
      assert.equal(stored.profile!.guardianRelationship, profile.guardianRelationship)
      const parent = await a.db.parent.findFirstOrThrow()
      assert(await verifyPassword('1234', parent.pinHash))
      const second = await call('students', a.form.token, 'POST', { regNumber: 'FORM02', fullName: 'Form Child Two', classArmId: a.second.id, ...profile })
      assert.equal(second.status, 201)
      assert.equal(second.body.data.student.classLevel, 'SS1')
      assert.equal(second.body.data.student.parentAccount.status, 'linked')
      assert.equal(await a.db.parent.count(), 1)
      assert.equal(await a.db.parentStudent.count({ where: { parentId: parent.id } }), 2)
      const login = await parentLogin.POST(new NextRequest('http://sms.test/api/auth/parent/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schoolSlug: a.school.slug, phone: profile.guardianPhone, pin: '1234' }) }), { params: Promise.resolve({}) })
      assert.equal(login.status, 200)
    })

    await t.test('subject-only, foreign and unassigned arms are blocked and teacher lists exclude unrelated children and PINs', async () => {
      const before = await a.db.student.count()
      for (const [token, classArmId, expected] of [[a.form.token, a.other.id, 403], [a.form.token, b.own.id, 404], [a.subject.token, a.other.id, 403]] as const) {
        assert.equal((await call('students', token, 'POST', { regNumber: 'DENIED', fullName: 'Denied Child', classArmId, ...profile })).status, expected)
      }
      assert.equal(await a.db.student.count(), before)
      const other = await createManagedStudent(a.admin.ctx, { regNumber: 'OTHER01', fullName: 'Other Arm Child', classArmId: a.other.id })
      await createManagedStudent(b.admin.ctx, { regNumber: 'FOREIGN01', fullName: 'Foreign Child', classArmId: b.own.id, ...profile })
      const list = await call('students', a.form.token)
      assert.equal(list.status, 200)
      assert.equal(list.body.data.meta.total, 2)
      assert(list.body.data.students.every((student: { id: string; pin?: string; profile?: unknown }) => student.id !== other.id && student.pin === undefined && student.profile === undefined))
      assert.equal((await call('students', a.form.token, 'GET', undefined, `?classArmId=${a.other.id}`)).status, 403)
      assert.equal((await call('students', a.subject.token)).status, 403)
      assert.equal((await call('students', a.admin.token)).body.data.meta.total, 3)
      assert.equal((await call('students', a.form.token, 'POST', { regNumber: 'FORGED', fullName: 'Forged Child', classArmId: a.own.id, schoolId: b.school.id })).status, 400)
    })

    await t.test('admission does not grant profile edits, placement changes, staff management or legacy level-only creation', async () => {
      for (const [area, body] of [
        ['students', { op: 'update', studentId: admittedId, guardianName: 'Changed Guardian' }],
        ['enrollments', { op: 'activate', academicSessionId: a.session.id }],
        ['photo', {}], ['parents', { op: 'update', parentId: (await a.db.parent.findFirstOrThrow()).id, pin: '9999' }],
      ] as const) assert.equal((await call(area, a.form.token, 'POST', body)).status, 403)
      const req = new NextRequest('http://sms.test/api/students', { method: 'POST', headers: { authorization: `Bearer ${a.form.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ regNumber: 'LEGACY-DENIED', fullName: 'Level Only Child', classLevel: 'JSS1' }) })
      assert.equal((await legacyStudents.POST(req, { params: Promise.resolve({}) })).status, 403)
    })

    const row = { regNumber: 'IMPORT01', fullName: 'Imported Child', classLevel: 'JSS1', arm: 'A', pin: '000042', ...profile }
    await t.test('dry runs preserve every profile field without writing and imports preserve existing parent credentials', async () => {
      const parent = await a.db.parent.findFirstOrThrow()
      await a.db.parent.update({ where: { id: parent.id }, data: { pinHash: await hashPassword('5566') } })
      const before = await a.db.student.count()
      const preview = await upload(a.form.token, [row], true)
      assert.equal(preview.status, 200)
      assert.equal(preview.body.data.preview[0].guardianPhone, '+2348012345678')
      assert.equal(preview.body.data.preview[0].address, profile.address)
      assert.equal(preview.body.data.preview[0].dateOfBirth, profile.dateOfBirth)
      assert.equal(preview.body.data.preview[0].pin, undefined)
      assert.equal(await a.db.student.count(), before)
      const imported = await upload(a.form.token, [row])
      assert.equal(imported.status, 200)
      assert.equal(imported.body.data.credentials[0].pin, '000042')
      assert.deepEqual(imported.body.data.guardianSummary, { created: 0, linked: 1, inactive: 0, incomplete: 0 })
      const stored = await a.db.student.findFirstOrThrow({ where: { regNumber: row.regNumber }, include: { profile: true, enrollments: true } })
      assert.equal(stored.profile!.gender, profile.gender)
      assert.equal(stored.profile!.address, profile.address)
      assert.equal(stored.profile!.guardianEmail, profile.guardianEmail)
      assert.equal(stored.profile!.guardianRelationship, profile.guardianRelationship)
      assert.equal(stored.enrollments[0]!.classArmId, a.own.id)
      assert(await verifyPassword('5566', (await a.db.parent.findFirstOrThrow({ where: { id: parent.id } })).pinHash))
      assert.equal(await b.db.student.count(), 1)
      assert.notEqual((await b.db.parent.findFirstOrThrow()).id, parent.id)
    })

    await t.test('an invalid profile, unassigned arm, omitted arm or duplicate rejects the entire import with row errors', async () => {
      const before = { students: await a.db.student.count(), profiles: await a.db.studentProfile.count(), parents: await a.db.parent.count() }
      const result = await upload(a.form.token, [
        { ...row, regNumber: 'BATCH-GOOD' }, { ...row, regNumber: 'BATCH-BAD', guardianEmail: 'not-an-email' }, { ...row, regNumber: 'BATCH-ARM', arm: 'B' },
      ])
      assert.equal(result.status, 422)
      assert(result.body.error.details.errors.some((error: { row: number; column: string }) => error.row === 3 && error.column === 'guardianEmail'))
      assert(result.body.error.details.errors.some((error: { row: number; column: string }) => error.row === 4 && error.column === 'arm'))
      assert.equal((await upload(a.form.token, [{ ...row, regNumber: 'DEFAULT-DENIED', arm: '' }], false, true)).status, 422)
      assert.equal((await upload(a.form.token, [row])).status, 422)
      assert.equal((await upload(a.subject.token, [{ ...row, regNumber: 'SUBJECT-DENIED' }])).status, 403)
      assert.deepEqual({ students: await a.db.student.count(), profiles: await a.db.studentProfile.count(), parents: await a.db.parent.count() }, before)
    })

    await t.test('batch siblings share a new guardian; incomplete and inactive accounts are reported', async () => {
      const inactive = await a.db.parent.create({ data: { schoolId: a.school.id, fullName: 'Inactive Parent', phone: '+2348012345671', pinHash: 'unchanged', isActive: false } })
      const result = await upload(a.admin.token, [
        { ...row, regNumber: 'NEW-GUARDIAN-1', guardianName: 'New Guardian', guardianPhone: '08012345670', arm: '' },
        { ...row, regNumber: 'NEW-GUARDIAN-2', guardianName: 'New Guardian', guardianPhone: '+2348012345670' },
        { ...row, regNumber: 'INCOMPLETE', guardianPhone: '' }, { ...row, regNumber: 'INACTIVE', guardianPhone: '08012345671' },
      ], false, true)
      assert.equal(result.status, 200)
      assert.deepEqual(result.body.data.guardianSummary, { created: 1, linked: 1, inactive: 1, incomplete: 1 })
      assert.equal(result.body.data.warnings[0].code, 'GUARDIAN_INCOMPLETE')
      const parent = await a.db.parent.findFirstOrThrow({ where: { phone: '+2348012345670' } })
      assert.equal(await a.db.parentStudent.count({ where: { parentId: parent.id } }), 2)
      assert(await verifyPassword('1234', parent.pinHash))
      assert.equal((await a.db.parent.findFirstOrThrow({ where: { id: inactive.id } })).pinHash, 'unchanged')
      assert.equal((await a.db.enrollment.findFirstOrThrow({ where: { student: { regNumber: 'NEW-GUARDIAN-1' } } })).classArmId, a.other.id)
    })

    await t.test('a guardian-link failure rolls back students, profiles, placements and newly created parents', async () => {
      const failing = a.db.$extends({ query: { parentStudent: { async createMany() { throw new Error('Injected guardian-link failure') } } } })
      const before = { students: await a.db.student.count(), profiles: await a.db.studentProfile.count(), parents: await a.db.parent.count(), enrollments: await a.db.enrollment.count() }
      await assert.rejects(createRosterStudents({ ...a.form.ctx, db: failing }, [{ ...row, regNumber: 'ROLLBACK-GUARDIAN', classLevel: 'JSS1', guardianPhone: '08012345672' }]), /Injected guardian-link failure/)
      assert.deepEqual({ students: await a.db.student.count(), profiles: await a.db.studentProfile.count(), parents: await a.db.parent.count(), enrollments: await a.db.enrollment.count() }, before)
    })

    await t.test('form assignments and account activation are rechecked after preview and before commit', async () => {
      const candidate = { ...row, regNumber: 'REVOKED' }
      assert.equal((await upload(a.form.token, [candidate], true)).status, 200)
      await a.db.classArm.update({ where: { id: a.own.id }, data: { formTeacherId: null } })
      assert.equal((await upload(a.form.token, [candidate])).status, 422)
      assert.equal((await call('students', a.form.token, 'POST', { regNumber: 'REVOKED-SINGLE', fullName: 'Revoked Child', classArmId: a.own.id })).status, 403)
      await a.db.user.update({ where: { id: a.form.user.id }, data: { isActive: false } })
      assert.equal((await call('students', a.form.token)).status, 403)
      await assert.rejects(createManagedStudent(a.form.ctx, { regNumber: 'INACTIVE-DIRECT', fullName: 'Inactive Child', classArmId: a.second.id }), { code: 'FORBIDDEN' })
      assert.equal(await a.db.student.count({ where: { regNumber: { in: ['REVOKED', 'REVOKED-SINGLE', 'INACTIVE-DIRECT'] } } }), 0)
    })
  } finally {
    const where = { schoolId: { in: schoolIds } }
    await root.parentStudent.deleteMany({ where }); await root.parent.deleteMany({ where }); await root.studentProfile.deleteMany({ where })
    await root.enrollment.deleteMany({ where }); await root.teachingAssignment.deleteMany({ where }); await root.classArm.deleteMany({ where })
    await root.subject.deleteMany({ where }); await root.academicSession.deleteMany({ where }); await root.student.deleteMany({ where }); await root.user.deleteMany({ where })
    await root.school.deleteMany({ where: { id: { in: schoolIds } } }); await root.$disconnect()
  }
})
