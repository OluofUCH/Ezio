import assert from 'node:assert/strict'
import test from 'node:test'
import { portalHome, portalNavigation } from '../src/modules/shared/navigation'
import { assertSchoolAdministrator, assertStaffScope } from '../src/modules/shared/authorization'
import { canManageSchool, canReadStudentPins } from '../lib/auth/session'
import { createSchoolSchema, updateSchoolSchema } from '../lib/validation/school'

test('platform navigation exposes only the platform dashboard, school onboarding and own account', () => {
  assert.equal(portalHome('SUPER_ADMIN'), '/staff/platform')
  assert.deepEqual(portalNavigation('SUPER_ADMIN').map(item => 'href' in item ? item.href : item.id), [
    '/staff/platform', '/staff/schools', '/staff/account',
  ])
  assert.equal(portalHome('SCHOOL_ADMIN'), '/sms/staff')
  assert.equal(portalHome('TEACHER'), '/sms/staff')
  for (const role of ['SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as const) {
    assert(!portalNavigation(role).some(item => 'href' in item && ['/staff/platform', '/staff/schools'].includes(item.href)))
  }
})

test('only form teachers get student admission navigation', () => {
  const hasStudents = (canAdmitStudents: boolean) => portalNavigation('TEACHER', { canAdmitStudents })
    .some(item => 'href' in item && item.href === '/sms/staff/students')
  assert.equal(hasStudents(false), false)
  assert.equal(hasStudents(true), true)
})

test('school service guards and credential permissions do not treat platform admins as school admins', () => {
  const platform = { schoolId: 'school-a', session: { typ: 'staff' as const, userId: 'platform', role: 'SUPER_ADMIN' as const, schoolId: 'school-a' } }
  assert.throws(() => assertStaffScope(platform), { code: 'FORBIDDEN' })
  assert.throws(() => assertSchoolAdministrator(platform), { code: 'FORBIDDEN' })
  assert.equal(canManageSchool('SUPER_ADMIN'), false)
  assert.equal(canReadStudentPins('SUPER_ADMIN'), false)
  assert.equal(canManageSchool('SCHOOL_ADMIN'), true)
  assert.equal(canReadStudentPins('TEACHER'), false)
})

test('onboarding requires the first administrator and later school updates only change status', () => {
  const input = { name: 'Example School', slug: 'example-school' }
  assert.equal(createSchoolSchema.safeParse(input).success, false)
  assert.equal(createSchoolSchema.safeParse({ ...input, admin: { fullName: 'School Admin', email: 'admin@example.test', password: 'TemporaryPassword!42' } }).success, true)
  assert.deepEqual(updateSchoolSchema.parse({ isActive: false }), { isActive: false })
  for (const extra of [{ name: 'Renamed' }, { address: 'New address' }, { logoUrl: 'https://example.test/logo.png' }, { slug: 'other-school' }, { admin: {} }]) {
    assert.equal(updateSchoolSchema.safeParse({ isActive: true, ...extra }).success, false)
  }
  assert.equal(updateSchoolSchema.safeParse({}).success, false)
})
