import assert from 'node:assert/strict'
import test from 'node:test'
import { assertTeacherEligibility } from '../src/modules/staff/rules'
import {
  updateTeacherProfileSchema, createTeachingAssignmentSchema, assignmentStatusSchema,
  formTeacherSchema, teacherListSchema, assignmentListSchema,
} from '../src/modules/staff/validation'

test('optional profile values can be cleared without accepting account or tenant fields', () => {
  assert.deepEqual(updateTeacherProfileSchema.parse({ phone: ' 08012345678 ', qualifications: '   ' }), { phone: '08012345678', qualifications: null })
  assert.deepEqual(updateTeacherProfileSchema.parse({ phone: null }), { phone: null })
  assert.equal(updateTeacherProfileSchema.safeParse({}).success, false)
  for (const extra of [{ schoolId: 'other' }, { userId: 'other' }, { role: 'SUPER_ADMIN' }, { passwordHash: 'hash' }, { email: 'new@example.test' }]) {
    assert.equal(updateTeacherProfileSchema.safeParse({ phone: null, ...extra }).success, false)
  }
})

test('assignments require all four parent IDs and status edits cannot reassign history', () => {
  const input = { teacherId: 'teacher', subjectId: 'subject', classArmId: 'arm', academicSessionId: 'year' }
  assert.deepEqual(createTeachingAssignmentSchema.parse(input), input)
  assert.equal(createTeachingAssignmentSchema.safeParse({ ...input, academicSessionId: '' }).success, false)
  assert.equal(createTeachingAssignmentSchema.safeParse({ ...input, schoolId: 'other' }).success, false)
  assert.equal(assignmentStatusSchema.safeParse({ isActive: false, teacherId: 'other' }).success, false)
  assert.deepEqual(formTeacherSchema.parse({ teacherId: null }), { teacherId: null })
  assert.equal(formTeacherSchema.safeParse({ teacherId: 'teacher', role: 'FORM_TEACHER' }).success, false)
})

test('only active teachers qualify for assignment; inactive profiles remain manageable', () => {
  const active = { role: 'TEACHER' as const, isActive: true }
  assert.equal(assertTeacherEligibility(active, true), active)
  assert.throws(() => assertTeacherEligibility(null, true), { code: 'NOT_FOUND' })
  assert.throws(() => assertTeacherEligibility({ role: 'SCHOOL_ADMIN', isActive: true }, true), { code: 'NOT_FOUND' })
  assert.throws(() => assertTeacherEligibility({ ...active, isActive: false }, true), { code: 'CONFLICT' })
  assert.doesNotThrow(() => assertTeacherEligibility({ ...active, isActive: false }, false))
})

test('staff filters validate raw queries and their parsed service form consistently', () => {
  const teachers = teacherListSchema.parse({ isActive: 'false' })
  assert.equal(teachers.isActive, false)
  assert.deepEqual(teacherListSchema.parse(teachers), teachers)
  const assignments = assignmentListSchema.parse({ isActive: 'true', teacherId: 'teacher' })
  assert.deepEqual(assignmentListSchema.parse(assignments), assignments)
  assert.equal(teacherListSchema.safeParse({ schoolId: 'other' }).success, false)
})
