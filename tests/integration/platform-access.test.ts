import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'

test('platform onboarding, totals and school-role boundaries', async t => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated migrated database.')
  Object.assign(process.env, { DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL, JWT_SECRET: 'platform-boundary-test-secret-at-least-32-characters' })
  const { unscopedDb: root } = await import('../../lib/db')
  const { signStaffToken, signStudentToken, signParentToken } = await import('../../lib/auth/jwt')
  const { signSchoolScope, SMS_SCHOOL_COOKIE } = await import('../../src/modules/shared/school-scope-token')
  const { hashPassword, verifyPassword } = await import('../../lib/auth/password')
  const { requireParent } = await import('../../lib/auth/parent')
  const { requireStudent } = await import('../../lib/auth/session')
  const schools = await import('../../app/api/schools/route')
  const school = await import('../../app/api/schools/[schoolId]/route')
  const dashboard = await import('../../app/api/platform/dashboard/route')
  const me = await import('../../app/api/auth/staff/me/route')
  const password = await import('../../app/api/auth/staff/change-password/route')
  const users = await import('../../app/api/users/route')
  const user = await import('../../app/api/users/[userId]/route')
  const students = await import('../../app/api/students/route')
  const studentImport = await import('../../app/api/students/import/route')
  const exams = await import('../../app/api/exams/route')
  const halls = await import('../../app/api/local-servers/route')
  const template = await import('../../app/api/templates/students.csv/route')
  const questionTemplate = await import('../../app/api/templates/questions.xlsx/route')
  const selector = await import('../../app/(sms)/api/sms/staff/school-context/route')
  const calendar = await import('../../app/(sms)/api/sms/staff/academic-sessions/route')
  const workspace = await import('../../app/(sms)/api/sms/staff/workspace/[area]/route')
  const empty = { params: Promise.resolve({}) }
  type Handler = (req: NextRequest) => Promise<Response>
  const request = (method: string, path: string, token?: string, body?: unknown, cookie?: string) => new NextRequest(`http://sms.test${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  async function send(handler: Handler, method: string, path: string, token?: string, body?: unknown, cookie?: string) {
    const response = await handler(request(method, path, token, body, cookie))
    return { status: response.status, body: await response.json() }
  }
  const suffix = randomUUID(), schoolIds: string[] = [], platformIds: string[] = []
  try {
    const before = { schools: await root.school.count(), active: await root.school.count({ where: { isActive: true } }), students: await root.student.count(), teachers: await root.user.count({ where: { role: 'TEACHER', schoolId: { not: null } } }) }
    const originalPassword = 'TemporaryPassword!42'
    const platform = await root.user.create({ data: { fullName: 'Platform fixture', role: 'SUPER_ADMIN', email: `platform-${suffix}@test.local`, passwordHash: await hashPassword(originalPassword) } })
    platformIds.push(platform.id)
    const token = await signStaffToken({ sub: platform.id, role: 'SUPER_ADMIN', schoolId: null })
    const onboard = await send(req => schools.POST(req, empty), 'POST', '/api/schools', token, {
      name: 'Platform School A', slug: `platform-a-${suffix}`, admin: { fullName: 'School administrator', email: `admin-${suffix}@test.local`, password: originalPassword },
    })
    assert.equal(onboard.status, 201)
    const a = onboard.body.data.school; schoolIds.push(a.id)
    const b = await root.school.create({ data: { name: 'Platform School B', slug: `platform-b-${suffix}`, isActive: false } }); schoolIds.push(b.id)
    const adminToken = await signStaffToken({ sub: a.admin.id, role: 'SCHOOL_ADMIN', schoolId: a.id })
    const teachers = await Promise.all([a.id, b.id].map((schoolId, index) => root.user.create({ data: { schoolId, fullName: `Teacher ${index}`, email: `teacher-${index}-${suffix}@test.local`, role: 'TEACHER', isActive: index === 0, passwordHash: 'unused' } })))
    const teacherToken = await signStaffToken({ sub: teachers[0]!.id, role: 'TEACHER', schoolId: a.id })
    const child = await root.student.create({ data: { schoolId: a.id, regNumber: 'A001', fullName: 'Platform Child A', classLevel: 'JSS1', pin: '001234' } })
    await root.student.create({ data: { schoolId: b.id, regNumber: 'B001', fullName: 'Platform Child B', classLevel: 'JSS1', pin: '234567' } })
    const studentToken = await signStudentToken({ sub: child.id, schoolId: a.id, classLevel: 'JSS1' })
    const parent = await root.parent.create({ data: { schoolId: a.id, fullName: 'Platform Parent', phone: '+2348012345600', pinHash: 'unused' } })
    const parentToken = await signParentToken({ sub: parent.id, schoolId: a.id, authVersion: 1 })

    await t.test('dashboard counts all schools and teachers without counting admins or parents as teachers', async () => {
      const result = await send(req => dashboard.GET(req, empty), 'GET', '/api/platform/dashboard', token)
      assert.equal(result.status, 200)
      assert.deepEqual(result.body.data, { totals: { schools: before.schools + 2, students: before.students + 2, teachers: before.teachers + 2 }, schoolStatus: { active: before.active + 1, paused: before.schools - before.active + 1 } })
      for (const auth of [adminToken, teacherToken]) {
        assert.equal((await send(req => dashboard.GET(req, empty), 'GET', '/api/platform/dashboard', auth)).status, 403)
        assert.equal((await send(req => schools.GET(req, empty), 'GET', '/api/schools', auth)).status, 403)
        assert.equal((await send(req => schools.POST(req, empty), 'POST', '/api/schools', auth, {})).status, 403)
        assert.equal((await send(req => school.PATCH(req, { params: Promise.resolve({ schoolId: a.id }) }), 'PATCH', `/api/schools/${a.id}`, auth, { isActive: false })).status, 403)
      }
      for (const auth of [undefined, studentToken, parentToken]) assert.equal((await send(req => dashboard.GET(req, empty), 'GET', '/api/platform/dashboard', auth)).status, 401)
    })

    await t.test('onboarding is atomic, requires an administrator, and does not expose credentials', async () => {
      assert.equal(a.admin.role, 'SCHOOL_ADMIN')
      assert.equal(a.admin.passwordHash, undefined)
      assert(await verifyPassword(originalPassword, (await root.user.findUniqueOrThrow({ where: { id: a.admin.id } })).passwordHash))
      const count = await root.school.count()
      assert.equal((await send(req => schools.POST(req, empty), 'POST', '/api/schools', token, { name: 'No admin', slug: `no-admin-${suffix}` })).status, 400)
      assert.equal((await send(req => schools.POST(req, empty), 'POST', '/api/schools', token, { name: 'Duplicate admin', slug: `duplicate-${suffix}`, admin: { fullName: 'Duplicate', email: a.admin.email, password: originalPassword } })).status, 409)
      assert.equal(await root.school.count(), count)
    })

    await t.test('platform accounts cannot access school APIs through query parameters, signed legacy cookies or a stored schoolId', async () => {
      const cookie = `${SMS_SCHOOL_COOKIE}=${await signSchoolScope(platform.id, a.id)}`
      await root.user.update({ where: { id: platform.id }, data: { schoolId: a.id } })
      const endpoints: [Handler, string, string][] = [
        [req => users.GET(req, empty), 'GET', '/api/users'], [req => users.POST(req, empty), 'POST', '/api/users'],
        [req => user.PATCH(req, { params: Promise.resolve({ userId: a.admin.id }) }), 'PATCH', `/api/users/${a.admin.id}`],
        [req => students.GET(req, empty), 'GET', '/api/students'], [req => students.POST(req, empty), 'POST', '/api/students'],
        [req => studentImport.POST(req, empty), 'POST', '/api/students/import'],
        [req => exams.GET(req, empty), 'GET', '/api/exams'], [req => exams.POST(req, empty), 'POST', '/api/exams'],
        [req => halls.GET(req, empty), 'GET', '/api/local-servers'], [req => halls.POST(req, empty), 'POST', '/api/local-servers'],
        [req => template.GET(req, empty), 'GET', '/api/templates/students.csv'], [req => questionTemplate.GET(req, empty), 'GET', '/api/templates/questions.xlsx'],
        [req => calendar.GET(req, empty), 'GET', '/api/sms/staff/academic-sessions'], [req => calendar.POST(req, empty), 'POST', '/api/sms/staff/academic-sessions'],
        [req => selector.POST(req, empty), 'POST', '/api/sms/staff/school-context'],
      ]
      for (const area of ['dashboard', 'lookups', 'students', 'parents', 'fees', 'attendance', 'assessment', 'scores', 'reports', 'announcements', 'bridge']) {
        const ctx = { params: Promise.resolve({ area }) }
        endpoints.push([req => workspace.GET(req, ctx), 'GET', `/api/sms/staff/workspace/${area}`], [req => workspace.POST(req, ctx), 'POST', `/api/sms/staff/workspace/${area}`])
      }
      for (const [handler, method, path] of endpoints) {
        assert.equal((await send(handler, method, `${path}?schoolId=${a.id}`, token, method === 'GET' ? undefined : { schoolId: a.id }, cookie)).status, 403, `${method} ${path}`)
      }
      await root.user.update({ where: { id: platform.id }, data: { schoolId: null } })
      assert.equal((await send(req => students.GET(req, empty), 'GET', `/api/students?schoolId=${b.id}`, adminToken, undefined, cookie)).body.data.students[0].id, child.id)
      assert.equal((await send(req => me.GET(req, empty), 'GET', '/api/auth/staff/me', token)).body.data.permissions.canManageStudents, false)
    })

    await t.test('pause and reactivation apply to existing school staff, student and parent sessions', async () => {
      const changeStatus = (isActive: boolean, extra = {}) => send(req => school.PATCH(req, { params: Promise.resolve({ schoolId: a.id }) }), 'PATCH', `/api/schools/${a.id}`, token, { isActive, ...extra })
      assert.equal((await changeStatus(false, { name: 'Unauthorized rename' })).status, 400)
      assert.equal((await changeStatus(false)).status, 200)
      assert.equal((await send(req => students.GET(req, empty), 'GET', '/api/students', adminToken)).status, 403)
      assert.equal((await send(req => workspace.GET(req, { params: Promise.resolve({ area: 'dashboard' }) }), 'GET', '/api/sms/staff/workspace/dashboard', teacherToken)).status, 403)
      await assert.rejects(requireStudent(request('GET', '/api/student/exams', studentToken)), { code: 'FORBIDDEN' })
      await assert.rejects(requireParent(request('GET', '/api/sms/parent/workspace/children', parentToken)), { code: 'FORBIDDEN' })
      const paused = await send(req => dashboard.GET(req, empty), 'GET', '/api/platform/dashboard', token)
      assert.equal(paused.body.data.schoolStatus.active, before.active)
      assert.equal(paused.body.data.totals.students, before.students + 2)
      assert.equal((await changeStatus(true)).status, 200)
      assert.equal((await send(req => students.GET(req, empty), 'GET', '/api/students', adminToken)).status, 200)
      await requireStudent(request('GET', '/api/student/exams', studentToken))
      await requireParent(request('GET', '/api/sms/parent/workspace/children', parentToken))
      assert.equal((await root.school.findUniqueOrThrow({ where: { id: a.id } })).name, a.name)
    })

    await t.test('platform admins retain only their own password change and live role changes take effect', async () => {
      const adminBefore = (await root.user.findUniqueOrThrow({ where: { id: a.admin.id } })).passwordHash
      const body = { currentPassword: originalPassword, newPassword: 'ChangedPlatformPassword!42' }
      assert.equal((await send(req => password.POST(req, empty), 'POST', '/api/auth/staff/change-password', token, { ...body, userId: a.admin.id })).status, 400)
      assert.equal((await send(req => password.POST(req, empty), 'POST', '/api/auth/staff/change-password', token, body)).status, 200)
      assert(await verifyPassword(body.newPassword, (await root.user.findUniqueOrThrow({ where: { id: platform.id } })).passwordHash))
      assert.equal((await root.user.findUniqueOrThrow({ where: { id: a.admin.id } })).passwordHash, adminBefore)
      await root.user.update({ where: { id: platform.id }, data: { role: 'SCHOOL_ADMIN', schoolId: a.id } })
      assert.equal((await send(req => dashboard.GET(req, empty), 'GET', '/api/platform/dashboard', token)).status, 403)
      assert.equal((await send(req => students.GET(req, empty), 'GET', '/api/students', token)).status, 200)
      await root.user.update({ where: { id: platform.id }, data: { role: 'SUPER_ADMIN', schoolId: null, isActive: false } })
      assert.equal((await send(req => dashboard.GET(req, empty), 'GET', '/api/platform/dashboard', token)).status, 403)
    })
  } finally {
    const where = { schoolId: { in: schoolIds } }
    await root.parent.deleteMany({ where })
    await root.student.deleteMany({ where })
    await root.user.deleteMany({ where: { OR: [where, { id: { in: platformIds } }] } })
    await root.school.deleteMany({ where: { id: { in: schoolIds } } })
    await root.$disconnect()
  }
})
