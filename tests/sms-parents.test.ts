import assert from 'node:assert/strict'
import test from 'node:test'
import { parentPhoneSchema, parentLoginSchema, createParentSchema, updateParentSchema, commentSchema } from '../src/modules/parents/validation'
import { portalHome, portalNavigation } from '../src/modules/shared/navigation'
import { signParentToken, verifyToken } from '../lib/auth/jwt'

test('parent phone numbers normalise to one login identity', () => {
  for (const phone of ['08012345678', '+234 801 234 5678', '2348012345678', '(0801) 234-5678']) assert.equal(parentPhoneSchema.parse(phone), '+2348012345678')
  assert.equal(parentPhoneSchema.parse('+447123456789'), '+447123456789')
  for (const phone of ['abc08012345678', '0801', '+234+8012345678']) assert.equal(parentPhoneSchema.safeParse(phone).success, false)
  assert.equal(parentLoginSchema.parse({ schoolSlug: 'grace-school', phone: '08012345678', pin: '001234' }).pin, '001234')
})

test('parent mutations cannot set roles, tenant scope, hashes or comment authors', () => {
  const input = { fullName: 'Parent One', phone: '08012345678', pin: '001234', studentId: 'child' }
  for (const extra of [{ schoolId: 'other' }, { role: 'TEACHER' }, { pinHash: 'hash' }, { authVersion: 999 }]) assert.equal(createParentSchema.safeParse({ ...input, ...extra }).success, false)
  assert.equal(updateParentSchema.safeParse({ parentId: 'parent' }).success, false)
  assert.equal(commentSchema.safeParse({ parentStudentId: 'link', body: '   ' }).success, false)
  assert.equal(commentSchema.safeParse({ parentStudentId: 'link', body: 'x'.repeat(2001) }).success, false)
  assert.equal(commentSchema.safeParse({ parentStudentId: 'link', body: 'Hello', author: 'TEACHER' }).success, false)
  assert.equal(commentSchema.safeParse({ parentStudentId: 'link', body: 'Hello', teacherId: 'other' }).success, false)
})

test('parents receive a distinct session and only results/comments navigation', async () => {
  process.env.JWT_SECRET ??= 'parent-unit-test-secret-at-least-32-characters'
  const token = await signParentToken({ sub: 'parent', schoolId: 'school', authVersion: 2 })
  assert.deepEqual(await verifyToken(token), { typ: 'parent', sub: 'parent', schoolId: 'school', authVersion: 2 })
  assert.equal(portalHome('PARENT'), '/sms/parent')
  assert.deepEqual(portalNavigation('PARENT').map(item => 'href' in item ? item.href : item.id), ['/sms/parent', '/sms/parent/comments'])
})
