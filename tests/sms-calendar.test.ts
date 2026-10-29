import assert from 'node:assert/strict'
import test from 'node:test'
import { SignJWT } from 'jose'
import { verifyToken } from '../lib/auth/jwt'
import { createAcademicSessionSchema, createTermSchema } from '../src/modules/school-setup/calendar-validation'
import { signSchoolScope, verifySchoolScope } from '../src/modules/shared/school-scope-token'

process.env.JWT_SECRET = 'calendar-scope-unit-tests-45b3ec89a5de4ed09fa5535700cbeb18'
const period = { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' }

test('calendar inputs reject invalid dates, reversed periods and privileged fields', () => {
  assert.deepEqual(createAcademicSessionSchema.parse(period), period)
  for (const extra of [{ schoolId: 'other-school' }, { isCurrent: true }, { terms: [] }]) {
    assert.equal(createAcademicSessionSchema.safeParse({ ...period, ...extra }).success, false)
  }
  assert.equal(createAcademicSessionSchema.safeParse({ ...period, startDate: '2026-02-30' }).success, false)
  assert.equal(createAcademicSessionSchema.safeParse({ ...period, endDate: '2025-01-01' }).success, false)
  assert.equal(createTermSchema.safeParse({ ...period, orderIndex: 0 }).success, false)
  assert.equal(createTermSchema.safeParse({ ...period, orderIndex: 1.5 }).success, false)
})

test('SMS school selection is signed and bound to its authenticated owner', async () => {
  const token = await signSchoolScope('super-a', 'school-a')
  assert.equal(await verifySchoolScope(token, 'super-a'), 'school-a')
  await assert.rejects(verifySchoolScope(token, 'super-b'), { code: 'FORBIDDEN' })
  await assert.rejects(verifySchoolScope(`${token.slice(0, 25)}x${token.slice(26)}`, 'super-a'), { code: 'FORBIDDEN' })
})

test('school-selection tokens cannot authenticate as staff or students', async () => {
  await assert.rejects(verifyToken(await signSchoolScope('super-a', 'school-a')), { code: 'UNAUTHENTICATED' })
})

test('expired and non-expiring school-selection cookies are rejected', async () => {
  const key = new TextEncoder().encode(process.env.JWT_SECRET)
  const base = () => new SignJWT({ typ: 'sms-school', schoolId: 'school-a' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('cbt-sms-school').setAudience('cbt-sms')
    .setSubject('super-a').setIssuedAt()
  await assert.rejects(verifySchoolScope(await base().setExpirationTime(1).sign(key), 'super-a'), { code: 'FORBIDDEN' })
  await assert.rejects(verifySchoolScope(await base().sign(key), 'super-a'), { code: 'FORBIDDEN' })
})
