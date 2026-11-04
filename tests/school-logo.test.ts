import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import sharp from 'sharp'
import { normalizeSchoolLogo } from '../lib/school-logo'
import { SCHOOL_LOGO_MAX_BYTES } from '../lib/validation/school-logo'

function image(background = '#33669980') {
  return sharp({ create: { width: 800, height: 400, channels: 4, background } })
}

function logoBytes(url: string): Buffer {
  assert.match(url, /^data:image\/webp;base64,/)
  return Buffer.from(url.split(',')[1]!, 'base64')
}

test('school logos accept supported images, preserve shape/transparency, and bound stored size', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const logo = await normalizeSchoolLogo(await image().toFormat(format).toBuffer())
    const bytes = logoBytes(logo)
    const metadata = await sharp(bytes).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 512)
    assert.equal(metadata.height, 256)
    assert.equal(metadata.hasAlpha, format !== 'jpeg')
    assert(bytes.length <= 128 * 1024)
  }
})

test('school logos apply camera orientation and discard embedded metadata', async () => {
  const input = await image().withMetadata({ orientation: 6 }).jpeg().toBuffer()
  const metadata = await sharp(logoBytes(await normalizeSchoolLogo(input))).metadata()
  assert.equal(metadata.width, 256)
  assert.equal(metadata.height, 512)
  assert.equal(metadata.orientation, undefined)
  assert.equal(metadata.exif, undefined)
})

test('school logos reject empty, oversized, malformed, disguised and excessive-pixel images', async () => {
  await assert.rejects(normalizeSchoolLogo(Buffer.alloc(0)), { status: 400 })
  await assert.rejects(normalizeSchoolLogo(Buffer.alloc(SCHOOL_LOGO_MAX_BYTES + 1)), { status: 413 })
  await assert.rejects(normalizeSchoolLogo(Buffer.from('not an image')), { status: 400 })
  await assert.rejects(normalizeSchoolLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')), { status: 415 })
  const large = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: '#fff' } }).png().toBuffer()
  await assert.rejects(normalizeSchoolLogo(large), { status: 400 })
  const png = await image().png().toBuffer()
  await assert.rejects(normalizeSchoolLogo(png.subarray(0, Math.floor(png.length / 2))), { status: 400 })
})

test('school logo endpoints enforce live admin permissions and school isolation', async (t) => {
  process.env.JWT_SECRET = 'school-logo-test-secret-at-least-32-characters'
  const { unscopedDb } = await import('../lib/db')
  const { signStaffToken, signStudentToken, signParentToken } = await import('../lib/auth/jwt')
  const { POST, DELETE } = await import('../app/api/school/logo/route')
  type School = { id: string; name: string; logoUrl: string | null }
  const schools: Record<string, School> = {
    'school-a': { id: 'school-a', name: 'School A', logoUrl: null },
    'school-b': { id: 'school-b', name: 'School B', logoUrl: null },
  }
  const liveUser: { isActive: boolean; role: 'SCHOOL_ADMIN' | 'TEACHER' | 'SUPER_ADMIN'; schoolId: string | null; school: { isActive: boolean } } = {
    isActive: true, role: 'SCHOOL_ADMIN', schoolId: 'school-a', school: { isActive: true },
  }
  // Prisma delegates are proxies rather than ordinary configurable methods.
  const findUser = unscopedDb.user.findUnique
  Object.assign(unscopedDb.user, { findUnique: async () => liveUser })
  t.after(() => { Object.assign(unscopedDb.user, { findUnique: findUser }) })

  // Intercept only the database executor, after the real tenant extension has
  // scoped the write. No database connection or test tenant is needed.
  const originalExtend = unscopedDb.$extends
  let writes = 0
  Object.assign(unscopedDb, { $extends: (extension: Parameters<typeof unscopedDb.$extends>[0]) => {
    const scoped = originalExtend.call(unscopedDb, extension)
    return originalExtend.call(scoped, {
      query: {
        async $allOperations({ model, operation, args }: { model?: string; operation: string; args: unknown }) {
          assert.equal(model, 'School')
          assert.equal(operation, 'update')
          const { where, data } = args as { where: { id: string }; data: { logoUrl: string | null } }
          const school = schools[where.id]
          assert(school, 'The write must resolve an authenticated school.')
          Object.assign(school, data)
          writes++
          return { ...school }
        },
      },
    })
  } })
  t.after(() => { Object.assign(unscopedDb, { $extends: originalExtend }) })

  const admin = await signStaffToken({ sub: 'admin', schoolId: 'school-a', role: 'SCHOOL_ADMIN' })
  const student = await signStudentToken({ sub: 'student', schoolId: 'school-a', classLevel: 'JSS1' })
  const parent = await signParentToken({ sub: 'parent', schoolId: 'school-a', authVersion: 1 })
  const png = await image().png().toBuffer()
  const empty = { params: Promise.resolve({}) }
  function request(method: 'POST' | 'DELETE', token?: string, bytes = png, filename = 'logo.png', crossSite = false) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), filename)
    form.append('schoolId', 'school-b')
    return new NextRequest('http://school.test/api/school/logo?schoolId=school-b', {
      method,
      headers: { host: 'school.test', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(crossSite ? { origin: 'https://other.test' } : {}) },
      body: method === 'POST' ? form : undefined,
    })
  }

  await t.test('only active school admins can upload or remove a logo', async () => {
    for (const [method, handler] of [['POST', POST], ['DELETE', DELETE]] as const) {
      for (const token of [undefined, student, parent]) assert.equal((await handler(request(method, token), empty)).status, 401)
      for (const role of ['TEACHER', 'SUPER_ADMIN'] as const) {
        liveUser.role = role
        assert.equal((await handler(request(method, admin), empty)).status, 403)
      }
      liveUser.role = 'SCHOOL_ADMIN'
      liveUser.isActive = false
      assert.equal((await handler(request(method, admin), empty)).status, 403)
      liveUser.isActive = true
      liveUser.school.isActive = false
      assert.equal((await handler(request(method, admin), empty)).status, 403)
      liveUser.school.isActive = true
      liveUser.schoolId = null
      assert.equal((await handler(request(method, admin), empty)).status, 403)
      liveUser.schoolId = 'school-a'
      assert.equal((await handler(request(method, admin, png, 'logo.png', true), empty)).status, 403)
    }
    assert.equal(writes, 0)
  })

  await t.test('upload and replacement persist only to the authenticated school', async () => {
    const first = await POST(request('POST', admin), empty)
    assert.equal(first.status, 200)
    const saved = (await first.json()).data.school
    assert.equal(saved.id, 'school-a')
    assert.equal(saved.logoUrl, schools['school-a']!.logoUrl)
    assert.equal((await sharp(logoBytes(saved.logoUrl)).metadata()).format, 'webp')
    assert.equal(schools['school-b']!.logoUrl, null)

    const replacement = await image('#ff0000').png().toBuffer()
    assert.equal((await POST(request('POST', admin, replacement), empty)).status, 200)
    assert.notEqual(schools['school-a']!.logoUrl, saved.logoUrl)
    assert.equal(schools['school-b']!.logoUrl, null)
  })

  await t.test('invalid uploads leave the saved logo intact', async () => {
    const saved = schools['school-a']!.logoUrl
    const before = writes
    assert.equal((await POST(request('POST', admin, Buffer.from('not an image')), empty)).status, 400)
    assert.equal((await POST(request('POST', admin, Buffer.alloc(0)), empty)).status, 400)
    assert.equal((await POST(request('POST', admin, Buffer.alloc(SCHOOL_LOGO_MAX_BYTES + 1)), empty)).status, 413)
    assert.equal((await POST(request('POST', admin, png, 'logo.svg'), empty)).status, 415)
    assert.equal(schools['school-a']!.logoUrl, saved)
    assert.equal(writes, before)
  })

  await t.test('live school reassignment overrides an old token and removal is scoped', async () => {
    const schoolALogo = schools['school-a']!.logoUrl
    liveUser.schoolId = 'school-b'
    const uploaded = await POST(request('POST', admin), empty)
    assert.equal(uploaded.status, 200)
    assert.equal((await uploaded.json()).data.school.id, 'school-b')
    const removed = await DELETE(request('DELETE', admin), empty)
    assert.equal(removed.status, 200)
    assert.equal((await removed.json()).data.school.logoUrl, null)
    assert.equal(schools['school-b']!.logoUrl, null)
    assert.equal(schools['school-a']!.logoUrl, schoolALogo)
    liveUser.schoolId = 'school-a'
    assert.equal((await DELETE(request('DELETE', admin), empty)).status, 200)
    assert.equal(schools['school-a']!.logoUrl, null)
  })
})
