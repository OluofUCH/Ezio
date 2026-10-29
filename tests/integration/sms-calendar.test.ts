import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { SMS_CONTEXT_HEADER, smsContextKey } from '../../src/modules/shared/context-key'

test('SMS calendar routes enforce tenant, role and calendar boundaries', async (t) => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated, migrated test database.')
  Object.assign(process.env, {
    DATABASE_URL: process.env.SMS_TEST_DATABASE_URL,
    DIRECT_URL: process.env.SMS_TEST_DATABASE_URL,
    JWT_SECRET: 'calendar-route-tests-771f77d6ec814d54bd6f43139233889b',
    NODE_ENV: 'production',
  })
  const { unscopedDb: db } = await import('../../lib/db')
  const { signStaffToken, signStudentToken } = await import('../../lib/auth/jwt')
  const calendar = await import('../../app/(sms)/api/sms/staff/academic-sessions/route')
  const terms = await import('../../app/(sms)/api/sms/staff/academic-sessions/[sessionId]/terms/route')
  const selector = await import('../../app/(sms)/api/sms/staff/school-context/route')
  const { SMS_SCHOOL_COOKIE } = await import('../../src/modules/shared/school-scope-token')
  const empty = { params: Promise.resolve({}) }
  const path = '/api/sms/staff/academic-sessions'
  const period = { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' }
  const token = randomUUID()
  const schools: string[] = []
  const users: string[] = []

  async function send(handler: (req: NextRequest) => Promise<Response>, method: string, url: string, auth?: string, body?: unknown, scope?: string, expectedContext?: string) {
    const headers: Record<string, string> = {}
    if (auth) headers.authorization = `Bearer ${auth}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (scope) headers.cookie = scope
    if (expectedContext) headers[SMS_CONTEXT_HEADER] = expectedContext
    const res = await handler(new NextRequest(`http://sms.test${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') }
  }
  const get = (auth?: string, scope?: string, query = '', expectedContext?: string) => send((req) => calendar.GET(req, empty), 'GET', `${path}${query}`, auth, undefined, scope, expectedContext)
  const create = (auth: string, body: unknown, scope?: string, expectedContext?: string) => send((req) => calendar.POST(req, empty), 'POST', path, auth, body, scope, expectedContext)
  const select = (auth: string, schoolId: string) => send((req) => selector.POST(req, empty), 'POST', '/api/sms/staff/school-context', auth, { schoolId })
  const term = (auth: string, sessionId: string, body: unknown) => send(
    (req) => terms.POST(req, { params: Promise.resolve({ sessionId }) }), 'POST', `${path}/${sessionId}/terms`, auth, body,
  )

  try {
    // Check the reviewed schema before creating any fixtures.
    await db.academicSession.count({ where: { schoolId: '__calendar_schema_probe__' } })
    const a = await db.school.create({ data: { name: 'Calendar A', slug: `calendar-a-${token}` } })
    schools.push(a.id)
    const b = await db.school.create({ data: { name: 'Calendar B', slug: `calendar-b-${token}` } })
    schools.push(b.id)
    async function staff(name: string, role: 'SCHOOL_ADMIN' | 'TEACHER' | 'SUPER_ADMIN', schoolId: string | null) {
      const user = await db.user.create({ data: { schoolId, role, email: `${name}-${token}@example.test`, fullName: name, passwordHash: 'fixture-not-a-login' } })
      users.push(user.id)
      return { user, token: await signStaffToken({ sub: user.id, role, schoolId }) }
    }
    const admin = await staff('admin', 'SCHOOL_ADMIN', a.id)
    const teacher = await staff('teacher', 'TEACHER', a.id)
    const superA = await staff('super-a', 'SUPER_ADMIN', null)
    const superB = await staff('super-b', 'SUPER_ADMIN', null)
    const studentToken = await signStudentToken({ sub: 'student-fixture', schoolId: a.id, classLevel: 'JSS1' })
    const foreignSession = await db.academicSession.create({ data: { schoolId: b.id, name: period.name, startDate: new Date('2026-09-01T00:00:00.000Z'), endDate: new Date('2027-07-31T00:00:00.000Z') } })
    let sessionId = ''

    await t.test('anonymous, student and teacher callers cannot read or configure the calendar', async () => {
      assert.equal((await get()).status, 401)
      assert.equal((await get(studentToken)).status, 401)
      assert.equal((await get(teacher.token)).status, 403)
      assert.equal((await create(teacher.token, period)).status, 403)
      assert.equal((await select(admin.token, b.id)).status, 403)
    })

    await t.test('school admins create inactive sessions in their own school and cannot supply privileged fields', async () => {
      const result = await create(admin.token, period)
      assert.equal(result.status, 201)
      sessionId = result.body.data.session.id
      assert.equal(result.body.data.session.isCurrent, false)
      assert.equal((await create(admin.token, { ...period, name: 'Forged', schoolId: b.id })).status, 400)
      assert.equal((await create(admin.token, { ...period, name: 'Activation', isCurrent: true })).status, 400)
      assert.equal((await create(admin.token, period)).status, 409)
      assert.equal((await get(admin.token, undefined, `?schoolId=${b.id}`)).status, 400)
      assert.deepEqual((await get(admin.token)).body.data.sessions.map((row: { id: string }) => row.id), [sessionId])
    })

    await t.test('term writes reject foreign parents, invalid ranges, duplicate order and overlap', async () => {
      const input = { name: 'First term', orderIndex: 1, startDate: '2026-09-01', endDate: '2026-12-20' }
      assert.equal((await term(admin.token, foreignSession.id, input)).status, 404)
      assert.equal((await term(admin.token, sessionId, { ...input, startDate: '2026-02-30' })).status, 400)
      assert.equal((await term(admin.token, sessionId, { ...input, startDate: '2026-08-01' })).status, 409)
      assert.equal((await term(admin.token, sessionId, input)).status, 201)
      assert.equal((await term(admin.token, sessionId, { ...input, name: 'Duplicate order' })).status, 409)
      assert.equal((await term(admin.token, sessionId, { ...input, name: 'Overlapping', orderIndex: 2, startDate: '2026-12-20', endDate: '2027-01-10' })).status, 409)
    })

    await t.test('concurrent overlapping terms cannot both commit', async () => {
      const results = await Promise.all([
        term(admin.token, sessionId, { name: 'Second term', orderIndex: 2, startDate: '2027-01-05', endDate: '2027-03-20' }),
        term(admin.token, sessionId, { name: 'Competing term', orderIndex: 3, startDate: '2027-02-01', endDate: '2027-04-01' }),
      ])
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409])
    })

    await t.test('stale browser school/account context cannot redirect a form to another tenant', async () => {
      const selected = await select(superA.token, b.id)
      const cookie = selected.cookie!.split(';')[0]!
      const stale = await create(superA.token, { ...period, name: 'Stale form' }, cookie, smsContextKey(superA.user.id, a.id))
      assert.equal(stale.status, 409)
      assert.equal(stale.body.error.details.reason, 'SCHOOL_SCOPE_CHANGED')
      assert.equal(await db.academicSession.count({ where: { name: 'Stale form', schoolId: { in: schools } } }), 0)
      assert.equal((await get(superA.token, cookie, '', smsContextKey(superB.user.id, b.id))).status, 409)
      assert.equal((await get(superA.token, cookie, '', smsContextKey(superA.user.id, b.id))).status, 200)
      assert.equal((await get(admin.token, undefined, '', smsContextKey(admin.user.id, b.id))).status, 409)
    })

    await t.test('Super Admin selection is signed, owner-bound, and cannot retarget a school account', async () => {
      assert.equal((await get(superA.token, undefined, `?schoolId=${b.id}`)).status, 409)
      const chosen = await select(superA.token, b.id)
      assert.equal(chosen.status, 200)
      assert.match(chosen.cookie!, /HttpOnly/i)
      assert.match(chosen.cookie!, /Secure/i)
      assert.equal(chosen.body.data.token, undefined)
      const cookie = chosen.cookie!.split(';')[0]!
      assert.equal((await get(superA.token, cookie)).body.data.schoolId, b.id)
      assert.equal((await get(superB.token, cookie)).status, 403)
      assert.equal((await get(superA.token, `${SMS_SCHOOL_COOKIE}=tampered`)).status, 403)
      assert.equal((await get(admin.token, cookie)).body.data.schoolId, a.id)
      const scopeToken = cookie.slice(cookie.indexOf('=') + 1)
      assert.equal((await get(scopeToken)).status, 401)
      await db.user.update({ where: { id: superA.user.id }, data: { role: 'SCHOOL_ADMIN', schoolId: a.id } })
      assert.equal((await get(superA.token, cookie)).body.data.schoolId, a.id)
    })

    await t.test('account and school deactivation are checked server-side; global management remains available', async () => {
      await db.user.update({ where: { id: admin.user.id }, data: { isActive: false } })
      assert.equal((await get(admin.token)).status, 403)
      await db.user.update({ where: { id: admin.user.id }, data: { isActive: true } })
      await db.school.update({ where: { id: a.id }, data: { isActive: false } })
      assert.equal((await get(admin.token)).status, 403)
      const selected = await select(superB.token, a.id)
      assert.equal(selected.status, 200)
      assert.equal((await get(superB.token, selected.cookie!.split(';')[0])).status, 200)
    })
  } finally {
    try {
      const where = { schoolId: { in: schools } }
      await db.term.deleteMany({ where })
      await db.academicSession.deleteMany({ where })
      await db.user.deleteMany({ where: { id: { in: users } } })
      await db.school.deleteMany({ where: { id: { in: schools } } })
    } finally { await db.$disconnect() }
  }
})
