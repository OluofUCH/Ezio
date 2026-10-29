import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { SMS_CONTEXT_HEADER, smsContextKey } from '../../src/modules/shared/context-key'

test('class-arm and subject APIs preserve tenant scope and placement history', async (t) => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated, migrated database.')
  Object.assign(process.env, {
    DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL,
    JWT_SECRET: 'structure-route-tests-05ac11caf6364231a5b18de36ea4bdab', NODE_ENV: 'production',
  })
  const { unscopedDb: db } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const { signStaffToken, signStudentToken } = await import('../../lib/auth/jwt')
  const arms = await import('../../app/(sms)/api/sms/staff/class-arms/route')
  const defaults = await import('../../app/(sms)/api/sms/staff/class-arms/[armId]/default/route')
  const subjects = await import('../../app/(sms)/api/sms/staff/subjects/route')
  const { createRosterStudents } = await import('../../src/modules/students/service')
  const { createLegacyExam } = await import('../../src/modules/school-setup/legacy-exams')
  const { createExamSchema } = await import('../../lib/validation/exam')
  const empty = { params: Promise.resolve({}) }
  const suffix = randomUUID()
  const schools: string[] = []

  async function send(handler: (req: NextRequest) => Promise<Response>, method: string, path: string, auth?: string, body?: unknown, expected?: string) {
    const headers: Record<string, string> = {}
    if (auth) headers.authorization = `Bearer ${auth}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (expected) headers[SMS_CONTEXT_HEADER] = expected
    const response = await handler(new NextRequest(`http://sms.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))
    return { status: response.status, body: await response.json() }
  }
  const getArms = (auth?: string, query = '') => send((req) => arms.GET(req, empty), 'GET', `/api/sms/staff/class-arms${query}`, auth)
  const addArm = (auth: string, body: unknown) => send((req) => arms.POST(req, empty), 'POST', '/api/sms/staff/class-arms', auth, body)
  const makeDefault = (auth: string, armId: string, expected?: string) => send((req) => defaults.POST(req, { params: Promise.resolve({ armId }) }), 'POST', `/api/sms/staff/class-arms/${armId}/default`, auth, {}, expected)
  const getSubjects = (auth?: string) => send((req) => subjects.GET(req, empty), 'GET', '/api/sms/staff/subjects', auth)
  const addSubject = (auth: string, body: unknown) => send((req) => subjects.POST(req, empty), 'POST', '/api/sms/staff/subjects', auth, body)

  try {
    await db.classArm.count({ where: { schoolId: '__structure_schema_probe__' } })
    const a = await db.school.create({ data: { name: 'Structure A', slug: `structure-a-${suffix}` } })
    schools.push(a.id)
    const b = await db.school.create({ data: { name: 'Structure B', slug: `structure-b-${suffix}` } })
    schools.push(b.id)
    const admin = await db.user.create({ data: { schoolId: a.id, email: `admin-${suffix}@example.test`, fullName: 'Structure Admin', passwordHash: 'fixture-not-a-login', role: 'SCHOOL_ADMIN' } })
    const teacher = await db.user.create({ data: { schoolId: a.id, email: `teacher-${suffix}@example.test`, fullName: 'Structure Teacher', passwordHash: 'fixture-not-a-login', role: 'TEACHER' } })
    const adminToken = await signStaffToken({ sub: admin.id, role: 'SCHOOL_ADMIN', schoolId: a.id })
    const teacherToken = await signStaffToken({ sub: teacher.id, role: 'TEACHER', schoolId: a.id })
    const studentToken = await signStudentToken({ sub: 'student-fixture', schoolId: a.id, classLevel: 'JSS2' })
    const context = { schoolId: a.id, db: tenantClient(a.id), session: { typ: 'staff' as const, role: 'SCHOOL_ADMIN' as const, userId: admin.id, schoolId: a.id } }
    let armA = '', armB = ''

    await t.test('anonymous, teacher and student access is denied server-side', async () => {
      assert.equal((await getArms()).status, 401)
      assert.equal((await getSubjects(studentToken)).status, 401)
      assert.equal((await getArms(teacherToken)).status, 403)
      assert.equal((await addArm(teacherToken, { level: 'JSS2', name: 'A' })).status, 403)
      assert.equal((await addSubject(teacherToken, { name: 'Math' })).status, 403)
    })

    await t.test('arm creation is scoped, level-checked and duplicate-safe', async () => {
      const first = await addArm(adminToken, { level: 'JSS2', name: ' A ' })
      assert.equal(first.status, 201)
      armA = first.body.data.arm.id
      assert.equal(first.body.data.arm.isDefault, false)
      assert.equal((await addArm(adminToken, { level: 'JSS2', name: 'a' })).status, 409)
      assert.equal((await addArm(adminToken, { level: 'JSS1', name: 'A' })).status, 201)
      assert.equal((await addArm(adminToken, { level: 'SS4', name: 'A' })).status, 400)
      assert.equal((await addArm(adminToken, { level: 'JSS2', name: 'X', schoolId: b.id })).status, 400)
      assert.equal((await addArm(adminToken, { level: 'JSS2', name: 'X', isDefault: true })).status, 400)
      assert.equal((await getArms(adminToken, `?schoolId=${b.id}`)).status, 400)
      const foreign = await db.classArm.create({ data: { schoolId: b.id, level: 'JSS2', name: 'A' } })
      assert.equal((await getArms(adminToken)).body.data.arms.some((row: { id: string }) => row.id === foreign.id), false)
      assert.equal((await makeDefault(adminToken, foreign.id)).status, 404)
      assert.equal((await makeDefault(adminToken, armA, smsContextKey(admin.id, b.id))).status, 409)
    })

    await t.test('default changes preserve existing placement and guide future level-only roster entries', async () => {
      assert.equal((await makeDefault(adminToken, armA)).status, 200)
      const session = await db.academicSession.create({ data: { schoolId: a.id, name: 'Current fixture', isCurrent: true, startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2027-07-31T00:00:00Z') } })
      const student = await db.student.create({ data: { schoolId: a.id, regNumber: 'OLD', pin: '001234', fullName: 'Existing Student', classLevel: 'JSS2' } })
      const enrollment = await db.enrollment.create({ data: { schoolId: a.id, academicSessionId: session.id, studentId: student.id, classArmId: armA, sequence: 1, isCurrent: true } })
      const created = await addArm(adminToken, { level: 'JSS2', name: 'B' })
      armB = created.body.data.arm.id
      assert.equal((await makeDefault(adminToken, armB)).status, 200)
      assert.deepEqual(await db.student.findUnique({ where: { id: student.id } }), student)
      assert.deepEqual(await db.enrollment.findUnique({ where: { id: enrollment.id } }), enrollment)
      assert.equal(await context.db.classArm.count({ where: { level: 'JSS2', isDefault: true } }), 1)
      await createRosterStudents(context, [{ regNumber: 'NEW', pin: '002345', fullName: 'New Student', classLevel: 'JSS2' }])
      const added = await context.db.student.findFirstOrThrow({ where: { regNumber: 'NEW' }, include: { enrollments: true } })
      assert.equal(added.enrollments[0]?.classArmId, armB)
      assert.equal(added.classLevel, 'JSS2')
    })

    await t.test('concurrent default changes leave exactly one default in the same school/level', async () => {
      const c = (await addArm(adminToken, { level: 'JSS2', name: 'C' })).body.data.arm.id
      const d = (await addArm(adminToken, { level: 'JSS2', name: 'D' })).body.data.arm.id
      const results = await Promise.all([makeDefault(adminToken, c), makeDefault(adminToken, d)])
      assert.deepEqual(results.map((result) => result.status), [200, 200])
      const current = await context.db.classArm.findMany({ where: { level: 'JSS2', isDefault: true } })
      assert.equal(current.length, 1)
      assert([c, d].includes(current[0]!.id))
      assert.equal(await db.classArm.count({ where: { schoolId: b.id, isDefault: true } }), 0)
    })

    await t.test('subject normalization reuses CBT identities without changing exam labels', async () => {
      const result = await addSubject(adminToken, { name: '  Mathematics  ' })
      assert.equal(result.status, 201)
      const subjectId = result.body.data.subject.id
      assert.equal((await addSubject(adminToken, { name: 'MATHEMATICS' })).status, 409)
      assert.equal((await addSubject(adminToken, { name: 'Maths' })).status, 201)
      assert.equal((await addSubject(adminToken, { name: '   ' })).status, 400)
      assert.equal((await addSubject(adminToken, { name: 'Injected', normalizedName: 'override' })).status, 400)
      const exam = await createLegacyExam(context, createExamSchema.parse({ title: 'Legacy subject reuse', subject: 'MATHEMATICS', classLevel: 'JSS2', durationMins: 30 }), { id: true, subject: true, subjectId: true })
      assert.equal(exam.subject, 'MATHEMATICS')
      assert.equal(exam.subjectId, subjectId)
      const list = await getSubjects(adminToken)
      assert.equal(list.body.data.subjects.find((row: { id: string }) => row.id === subjectId)._count.exams, 1)
      await db.subject.create({ data: { schoolId: b.id, name: 'Other school', normalizedName: 'other school' } })
      assert.equal((await getSubjects(adminToken)).body.data.subjects.some((row: { name: string }) => row.name === 'Other school'), false)
    })

    await t.test('concurrent normalized subject duplicates cannot both commit', async () => {
      const results = await Promise.all([addSubject(adminToken, { name: 'Biology' }), addSubject(adminToken, { name: 'BIOLOGY' })])
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409])
      assert.equal(await context.db.subject.count({ where: { normalizedName: 'biology' } }), 1)
    })
  } finally {
    try {
      const where = { schoolId: { in: schools } }
      await db.exam.deleteMany({ where })
      await db.enrollment.deleteMany({ where })
      await db.classArm.deleteMany({ where })
      await db.subject.deleteMany({ where })
      await db.academicSession.deleteMany({ where })
      await db.student.deleteMany({ where })
      await db.user.deleteMany({ where })
      await db.school.deleteMany({ where: { id: { in: schools } } })
    } finally { await db.$disconnect() }
  }
})
