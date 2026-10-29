import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { SMS_CONTEXT_HEADER, smsContextKey } from '../../src/modules/shared/context-key'

test('staff profiles and assignments enforce school and teacher eligibility', async (t) => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Select an isolated database after approval/application of the staff migration.')
  Object.assign(process.env, {
    DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL,
    JWT_SECRET: 'staff-route-tests-323fe235c8ed49dd8625a2c79ec945fe', NODE_ENV: 'production',
  })
  const { unscopedDb: db } = await import('../../lib/db')
  const { signStaffToken, signStudentToken } = await import('../../lib/auth/jwt')
  const teachers = await import('../../app/(sms)/api/sms/staff/teachers/route')
  const profiles = await import('../../app/(sms)/api/sms/staff/teachers/[teacherId]/profile/route')
  const assignments = await import('../../app/(sms)/api/sms/staff/teaching-assignments/route')
  const statuses = await import('../../app/(sms)/api/sms/staff/teaching-assignments/[assignmentId]/route')
  const forms = await import('../../app/(sms)/api/sms/staff/class-arms/[armId]/form-teacher/route')
  const empty = { params: Promise.resolve({}) }
  const schools: string[] = []
  const suffix = randomUUID()

  async function send(handler: (req: NextRequest) => Promise<Response>, method: string, path: string, auth?: string, body?: unknown, expected?: string) {
    const headers: Record<string, string> = {}
    if (auth) headers.authorization = `Bearer ${auth}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (expected) headers[SMS_CONTEXT_HEADER] = expected
    const response = await handler(new NextRequest(`http://sms.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))
    return { status: response.status, body: await response.json() }
  }
  const list = (auth?: string, query = '') => send((req) => teachers.GET(req, empty), 'GET', `/api/sms/staff/teachers${query}`, auth)
  const profile = (auth: string, teacherId: string, body: unknown, expected?: string) => send((req) => profiles.PATCH(req, { params: Promise.resolve({ teacherId }) }), 'PATCH', `/api/sms/staff/teachers/${teacherId}/profile`, auth, body, expected)
  const assign = (auth: string, body: unknown) => send((req) => assignments.POST(req, empty), 'POST', '/api/sms/staff/teaching-assignments', auth, body)
  const listAssignments = (auth: string, query = '') => send((req) => assignments.GET(req, empty), 'GET', `/api/sms/staff/teaching-assignments${query}`, auth)
  const status = (auth: string, assignmentId: string, body: unknown) => send((req) => statuses.PATCH(req, { params: Promise.resolve({ assignmentId }) }), 'PATCH', `/api/sms/staff/teaching-assignments/${assignmentId}`, auth, body)
  const form = (auth: string, armId: string, teacherId: string | null) => send((req) => forms.PUT(req, { params: Promise.resolve({ armId }) }), 'PUT', `/api/sms/staff/class-arms/${armId}/form-teacher`, auth, { teacherId })

  try {
    // Fail before creating fixtures when the separately reviewed migration is absent.
    await db.teacherProfile.count({ where: { schoolId: '__staff_schema_probe__' } })
    await db.teachingAssignment.count({ where: { schoolId: '__staff_schema_probe__' } })
    const a = await db.school.create({ data: { name: 'Staff A', slug: `staff-a-${suffix}` } })
    schools.push(a.id)
    const b = await db.school.create({ data: { name: 'Staff B', slug: `staff-b-${suffix}` } })
    schools.push(b.id)
    async function person(label: string, schoolId: string, role: 'SCHOOL_ADMIN' | 'TEACHER', isActive = true) {
      return db.user.create({ data: { schoolId, role, isActive, email: `${label}-${suffix}@example.test`, fullName: label, passwordHash: 'fixture-not-a-login' } })
    }
    const admin = await person('admin', a.id, 'SCHOOL_ADMIN')
    const teacher = await person('teacher', a.id, 'TEACHER')
    const inactive = await person('inactive', a.id, 'TEACHER', false)
    const foreignTeacher = await person('foreign', b.id, 'TEACHER')
    const adminToken = await signStaffToken({ sub: admin.id, role: admin.role, schoolId: a.id })
    const teacherToken = await signStaffToken({ sub: teacher.id, role: teacher.role, schoolId: a.id })
    const studentToken = await signStudentToken({ sub: 'student-fixture', schoolId: a.id, classLevel: 'JSS2' })
    async function setup(schoolId: string) {
      const subject = await db.subject.create({ data: { schoolId, name: 'Math', normalizedName: 'math' } })
      const arm = await db.classArm.create({ data: { schoolId, level: 'JSS2', name: 'A' } })
      const session = await db.academicSession.create({ data: { schoolId, name: '2026/2027', startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2027-07-31T00:00:00Z') } })
      return { subject, arm, session }
    }
    const own = await setup(a.id)
    const other = await setup(b.id)
    const input = { teacherId: teacher.id, subjectId: own.subject.id, classArmId: own.arm.id, academicSessionId: own.session.id }
    let assignmentId = ''

    await t.test('all staff-management actions require administrator authority', async () => {
      assert.equal((await list()).status, 401)
      assert.equal((await list(studentToken)).status, 401)
      assert.equal((await list(teacherToken)).status, 403)
      assert.equal((await profile(teacherToken, teacher.id, { phone: '08012345678' })).status, 403)
      assert.equal((await assign(teacherToken, input)).status, 403)
      assert.equal((await form(teacherToken, own.arm.id, teacher.id)).status, 403)
    })

    await t.test('profile updates are partial, nullable, school-scoped and do not alter credentials', async () => {
      assert.equal((await profile(adminToken, teacher.id, { phone: ' 08012345678 ' })).status, 200)
      assert.equal((await profile(adminToken, teacher.id, { qualifications: 'B.Ed.' })).status, 200)
      const cleared = await profile(adminToken, teacher.id, { phone: null })
      assert.equal(cleared.body.data.profile.phone, null)
      assert.equal(cleared.body.data.profile.qualifications, 'B.Ed.')
      assert.deepEqual(await db.user.findUnique({ where: { id: teacher.id } }), teacher)
      assert.equal(await db.teacherProfile.count({ where: { schoolId: a.id, userId: teacher.id } }), 1)
      assert.equal((await profile(adminToken, foreignTeacher.id, { phone: null })).status, 404)
      assert.equal((await profile(adminToken, admin.id, { phone: null })).status, 404)
      assert.equal((await profile(adminToken, teacher.id, { phone: null, schoolId: b.id })).status, 400)
      assert.equal((await profile(adminToken, teacher.id, { phone: null }, smsContextKey(admin.id, b.id))).status, 409)
      const listed = await list(adminToken)
      assert.equal(listed.body.data.teachers.length, 2)
      assert.equal(JSON.stringify(listed.body).includes('passwordHash'), false)
      assert.equal((await list(adminToken, '?isActive=false')).body.data.teachers[0].id, inactive.id)
    })

    await t.test('teaching assignments require active same-school teachers and all same-school parents', async () => {
      const created = await assign(adminToken, input)
      assert.equal(created.status, 201)
      assignmentId = created.body.data.assignment.id
      assert.equal((await assign(adminToken, input)).status, 409)
      for (const foreign of [
        { teacherId: foreignTeacher.id }, { subjectId: other.subject.id },
        { classArmId: other.arm.id }, { academicSessionId: other.session.id },
      ]) assert.equal((await assign(adminToken, { ...input, ...foreign })).status, 404)
      assert.equal((await assign(adminToken, { ...input, teacherId: inactive.id })).status, 409)
      assert.equal((await assign(adminToken, { ...input, teacherId: admin.id })).status, 404)
      assert.equal((await assign(adminToken, { ...input, schoolId: b.id })).status, 400)
    })

    await t.test('revocation preserves assignment identity and reactivation checks live teacher eligibility', async () => {
      assert.equal((await status(adminToken, assignmentId, { isActive: false })).body.data.assignment.isActive, false)
      assert.equal((await listAssignments(adminToken, '?isActive=false')).body.data.assignments[0].id, assignmentId)
      const reactivated = await assign(adminToken, input)
      assert.equal(reactivated.body.data.assignment.id, assignmentId)
      assert.equal(await db.teachingAssignment.count({ where: { schoolId: a.id } }), 1)
      assert.equal((await status(adminToken, assignmentId, { isActive: false, teacherId: foreignTeacher.id })).status, 400)
      await status(adminToken, assignmentId, { isActive: false })
      await db.user.update({ where: { id: teacher.id }, data: { isActive: false } })
      assert.equal((await status(adminToken, assignmentId, { isActive: true })).status, 409)
      await db.user.update({ where: { id: teacher.id }, data: { isActive: true, role: 'SCHOOL_ADMIN' } })
      assert.equal((await status(adminToken, assignmentId, { isActive: true })).status, 404)
      await db.user.update({ where: { id: teacher.id }, data: { role: 'TEACHER' } })
      assert.equal((await status(adminToken, assignmentId, { isActive: true })).status, 200)
    })

    await t.test('form-teacher designation uses the arm field and accepts only eligible teachers', async () => {
      assert.equal((await form(adminToken, own.arm.id, teacher.id)).body.data.arm.formTeacher.id, teacher.id)
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacher.id } })).role, 'TEACHER')
      assert.equal((await form(adminToken, other.arm.id, teacher.id)).status, 404)
      assert.equal((await form(adminToken, own.arm.id, foreignTeacher.id)).status, 404)
      assert.equal((await form(adminToken, own.arm.id, inactive.id)).status, 409)
      assert.equal((await form(adminToken, own.arm.id, admin.id)).status, 404)
      assert.equal((await form(adminToken, own.arm.id, null)).body.data.arm.formTeacher, null)
    })

    await t.test('a second academic session is distinct and concurrent duplicate assignments do not multiply', async () => {
      const future = await db.academicSession.create({ data: { schoolId: a.id, name: '2027/2028', startDate: new Date('2027-09-01T00:00:00Z'), endDate: new Date('2028-07-31T00:00:00Z') } })
      const results = await Promise.all([
        assign(adminToken, { ...input, academicSessionId: future.id }),
        assign(adminToken, { ...input, academicSessionId: future.id }),
      ])
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409])
      assert.equal(await db.teachingAssignment.count({ where: { schoolId: a.id } }), 2)
    })

    await t.test('composite foreign keys reject cross-school profile and assignment references', async () => {
      await assert.rejects(db.teacherProfile.create({ data: { schoolId: a.id, userId: foreignTeacher.id } }), { code: 'P2003' })
      await assert.rejects(db.teachingAssignment.create({ data: { schoolId: a.id, ...input, subjectId: other.subject.id } }), { code: 'P2003' })
      const foreignAssignment = await db.teachingAssignment.create({ data: { schoolId: b.id, teacherId: foreignTeacher.id, subjectId: other.subject.id, classArmId: other.arm.id, academicSessionId: other.session.id } })
      assert.equal((await status(adminToken, foreignAssignment.id, { isActive: false })).status, 404)
      assert.equal((await listAssignments(adminToken)).body.data.assignments.some((row: { id: string }) => row.id === foreignAssignment.id), false)
    })
  } finally {
    try {
      if (schools.length) {
        const where = { schoolId: { in: schools } }
        await db.teachingAssignment.deleteMany({ where })
        await db.teacherProfile.deleteMany({ where })
        await db.classArm.deleteMany({ where })
        await db.subject.deleteMany({ where })
        await db.academicSession.deleteMany({ where })
        await db.user.deleteMany({ where })
        await db.school.deleteMany({ where: { id: { in: schools } } })
      }
    } finally { await db.$disconnect() }
  }
})
