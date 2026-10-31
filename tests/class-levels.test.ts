import assert from 'node:assert/strict'
import test from 'node:test'
import { CLASS_LEVELS, isClassLevel } from '../lib/core/domain'
import { classLevelLabel } from '../lib/client/format'
import { parseRosterFile } from '../lib/import/students-csv'
import { signStudentToken, verifyToken } from '../lib/auth/jwt'
import { createClassArmSchema } from '../src/modules/school-setup/structure-validation'
import { backfillConfigSchema } from '../src/modules/school-setup/backfill-config'

test('nursery and primary levels work through roster imports, class creation and display', () => {
  const report = parseRosterFile(Buffer.from('regNumber,fullName,classLevel,pin\nN01,Nursery Child,Nursery 1,001234\nP01,Primary Child,Primary 6,002345\nP02,Another Child,PRY 2,003456\n'))
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.valid.map(row => row.classLevel), ['NURSERY1', 'PRIMARY6', 'PRIMARY2'])
  for (const level of CLASS_LEVELS) {
    assert(isClassLevel(level))
    assert(createClassArmSchema.safeParse({ level, name: 'A' }).success)
  }
  assert.equal(classLevelLabel('NURSERY2'), 'Nursery 2')
  assert.equal(classLevelLabel('PRIMARY6'), 'Primary 6')
  assert.equal(CLASS_LEVELS[CLASS_LEVELS.indexOf('NURSERY2') + 1], 'PRIMARY1')
  assert.equal(CLASS_LEVELS[CLASS_LEVELS.indexOf('PRIMARY6') + 1], 'JSS1')
  assert.equal(isClassLevel('PRIMARY7'), false)
})

test('student sessions accept early-years levels', async () => {
  process.env.JWT_SECRET ??= 'class-level-test-secret-at-least-32-characters'
  const token = await signStudentToken({ sub: 'child', schoolId: 'school', classLevel: 'PRIMARY1' })
  assert.deepEqual(await verifyToken(token), { typ: 'student', sub: 'child', schoolId: 'school', classLevel: 'PRIMARY1' })
})

test('legacy backfill mappings stay valid and early-years arms require an explicit default', () => {
  const input = { schoolId: 'school', session: { name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31' }, defaultArms: { JSS1: 'A', JSS2: 'A', JSS3: 'A', SS1: 'A', SS2: 'A', SS3: 'A' } }
  assert(backfillConfigSchema.safeParse(input).success)
  assert(backfillConfigSchema.safeParse({ ...input, defaultArms: { ...input.defaultArms, PRIMARY1: 'A', NURSERY1: 'A' } }).success)
})
