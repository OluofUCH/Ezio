import assert from 'node:assert/strict'
import test from 'node:test'
import { createClassArmSchema, createSubjectSchema, setDefaultArmSchema } from '../src/modules/school-setup/structure-validation'

test('class-arm input accepts fixed levels and normalizes display whitespace', () => {
  assert.deepEqual(createClassArmSchema.parse({ level: 'JSS2', name: '  Blue   House ' }), { level: 'JSS2', name: 'Blue House' })
  for (const level of ['JS2', 'SS4', '', 2]) assert.equal(createClassArmSchema.safeParse({ level, name: 'A' }).success, false)
})

test('setup inputs reject tenant, default and assignment fields supplied by the client', () => {
  for (const extra of [{ schoolId: 'other' }, { isDefault: true }, { formTeacherId: 'teacher' }]) {
    assert.equal(createClassArmSchema.safeParse({ level: 'JSS1', name: 'A', ...extra }).success, false)
  }
  assert.equal(createSubjectSchema.safeParse({ name: 'Math', normalizedName: 'override' }).success, false)
  assert.equal(createSubjectSchema.safeParse({ name: '   ' }).success, false)
  assert.equal(setDefaultArmSchema.safeParse({ schoolId: 'other' }).success, false)
})
