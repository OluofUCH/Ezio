import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRosterTemplate } from '../lib/import/templates'
import { parseRosterFile, ROSTER_HEADERS } from '../lib/import/students-csv'
import { managedStudentSchema, studentProfileSchema } from '../src/modules/students/management'

test('student admission accepts profile details in the same request and normalizes guardian phone numbers', () => {
  const input = { regNumber: 'p001', fullName: 'Ada Student', classArmId: 'arm', dateOfBirth: '2018-04-03', gender: 'Female', address: 'Lagos', guardianName: 'Parent Student', guardianRelationship: 'Mother', guardianPhone: '08012345678', guardianEmail: 'parent@example.test' }
  const parsed = managedStudentSchema.parse(input)
  assert.equal(parsed.guardianPhone, '+2348012345678')
  assert.equal(parsed.dateOfBirth, '2018-04-03')
  assert.equal(parsed.regNumber, 'P001')
  assert.equal(managedStudentSchema.safeParse({ ...input, schoolId: 'other' }).success, false)
  assert.equal(managedStudentSchema.safeParse({ ...input, guardianPhone: '0801' }).success, false)
  assert.equal(managedStudentSchema.safeParse({ ...input, dateOfBirth: '2018-02-30' }).success, false)
  assert.deepEqual(studentProfileSchema.parse({ dateOfBirth: '', guardianPhone: '', guardianEmail: '' }), { dateOfBirth: null, guardianPhone: null, guardianEmail: null })
})

test('the downloadable sample roster matches the parser and covers nursery through secondary', () => {
  const csv = buildRosterTemplate()
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.equal(csv.slice(1).split('\r\n')[0], ROSTER_HEADERS.join(','))
  const report = parseRosterFile(Buffer.from(csv))
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.valid.map(row => row.classLevel), ['NURSERY1', 'PRIMARY3', 'JSS1', 'SS1'])
  assert.equal(report.valid[1]!.pin, '001234')
  assert.equal(report.valid[1]!.arm, 'A')
  assert.equal(report.valid[2]!.arm, undefined)
  assert(report.valid[0]!.pinGenerated)
})
