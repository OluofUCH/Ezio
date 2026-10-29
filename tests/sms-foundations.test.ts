import assert from 'node:assert/strict'
import test from 'node:test'
import type { ScopedStaffContext } from '../lib/auth/session'
import { backfillConfigSchema } from '../src/modules/school-setup/backfill-config'
import { assertCurrentPlacement, defaultArmFor, subjectIdentity } from '../src/modules/school-setup/rules'
import { assertRosterManager, assertStaffScope } from '../src/modules/shared/authorization'

const config = {
  schoolId: 'school-a',
  session: { name: 'Test session', startDate: '2026-09-01', endDate: '2027-07-31' },
  defaultArms: { JSS1: 'A', JSS2: 'B', JSS3: 'A', SS1: 'A', SS2: 'A', SS3: 'A' },
}

test('backfill requires all six explicit arm mappings and valid dates', () => {
  assert.deepEqual(backfillConfigSchema.parse(config), config)
  assert.equal(backfillConfigSchema.safeParse({ ...config, defaultArms: { JSS1: 'A' } }).success, false)
  assert.equal(backfillConfigSchema.safeParse({ ...config, session: { ...config.session, startDate: '2026-02-30' } }).success, false)
  assert.equal(backfillConfigSchema.safeParse({ ...config, session: { ...config.session, startDate: '2028-01-01' } }).success, false)
  assert.equal(backfillConfigSchema.safeParse({ ...config, guessMissingArms: true }).success, false)
})

test('backfill accepts multiple arms per level only when the default is included', () => {
  const arms = { JSS1: ['A', 'B', 'C'], JSS2: ['A', 'B', 'C'], JSS3: ['A', 'B', 'C'], SS1: ['A', 'B', 'C'], SS2: ['A', 'B', 'C'], SS3: ['A', 'B', 'C'] }
  assert.equal(backfillConfigSchema.safeParse({ ...config, arms }).success, true)
  assert.equal(backfillConfigSchema.safeParse({ ...config, arms: { ...arms, JSS1: ['B', 'C'] } }).success, false)
  assert.equal(backfillConfigSchema.safeParse({ ...config, arms: { ...arms, JSS1: ['A', 'a'] } }).success, false)
  assert.equal(backfillConfigSchema.safeParse({ ...config, arms: { ...arms, JSS1: ['a', 'B', 'C'] } }).success, false)
  assert.equal(backfillConfigSchema.safeParse({ ...config, arms, defaultArms: { ...config.defaultArms, JSS1: 'a' } }).success, false)
})

test('subject mapping folds case/whitespace but never guesses subject aliases', () => {
  assert.deepEqual(subjectIdentity('  Agricultural   SCIENCE '), { name: 'Agricultural SCIENCE', normalizedName: 'agricultural science' })
  assert.notEqual(subjectIdentity('Maths').normalizedName, subjectIdentity('Mathematics').normalizedName)
  assert.throws(() => subjectIdentity('   '))
})

const student = { id: 'student-a', schoolId: 'school-a', classLevel: 'JSS2' as const }
const session = { id: 'session-a', schoolId: 'school-a' }
const placement = {
  studentId: student.id, schoolId: student.schoolId, academicSessionId: session.id,
  classArm: { schoolId: student.schoolId, level: student.classLevel },
}

test('matching existing placements are accepted without selecting a replacement arm', () => {
  assert.doesNotThrow(() => assertCurrentPlacement(student, session, placement))
})

test('cross-tenant, cross-student, cross-session and cross-class placements are rejected', () => {
  assert.throws(() => assertCurrentPlacement(student, session, { ...placement, schoolId: 'school-b' }), { code: 'NOT_FOUND' })
  assert.throws(() => assertCurrentPlacement(student, session, { ...placement, studentId: 'student-b' }), { code: 'NOT_FOUND' })
  assert.throws(() => assertCurrentPlacement(student, session, { ...placement, academicSessionId: 'old-session' }), { code: 'CONFLICT' })
  assert.throws(() => assertCurrentPlacement(student, session, {
    ...placement, classArm: { ...placement.classArm, level: 'SS1' },
  }), { code: 'CONFLICT' })
})

test('fallback arms must match both school and level and must be unambiguous', () => {
  const arm = { id: 'arm-a', schoolId: 'school-a', level: 'JSS2' as const, isDefault: true }
  const foreign = { ...arm, id: 'arm-b', schoolId: 'school-b' }
  assert.equal(defaultArmFor([foreign, arm], 'school-a', 'JSS2').id, arm.id)
  assert.throws(() => defaultArmFor([foreign], 'school-a', 'JSS2'), { code: 'CONFLICT' })
  assert.throws(() => defaultArmFor([arm], 'school-a', 'SS1'), { code: 'CONFLICT' })
  assert.throws(() => defaultArmFor([arm, { ...arm, id: 'duplicate' }], 'school-a', 'JSS2'), { code: 'CONFLICT' })
})

const admin = {
  schoolId: 'school-a',
  session: { typ: 'staff' as const, userId: 'admin-a', role: 'SCHOOL_ADMIN' as const, schoolId: 'school-a' },
}

test('staff service guards reject student principals and mismatched authenticated school scope', () => {
  assert.doesNotThrow(() => assertRosterManager(admin))
  assert.throws(() => assertRosterManager({ ...admin, session: { ...admin.session, role: 'TEACHER' } }), { code: 'FORBIDDEN' })
  assert.throws(() => assertStaffScope({ ...admin, schoolId: 'school-b' }), { code: 'FORBIDDEN' })
  const studentContext = {
    schoolId: 'school-a', session: { typ: 'student', studentId: 'student-a', schoolId: 'school-a' },
  } as unknown as ScopedStaffContext
  assert.throws(() => assertStaffScope(studentContext), { code: 'FORBIDDEN' })
})
