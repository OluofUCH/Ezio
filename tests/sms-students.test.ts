import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
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
  assert.equal(report.valid[0]!.address, '12 Example Street, Lagos')
  assert.equal(report.valid[0]!.guardianPhone, '+2348012345678')
  assert.equal(report.valid[0]!.guardianEmail, 'guardian.one@example.com')
  assert.equal(report.valid[0]!.guardianRelationship, 'Mother')
  assert.equal(report.valid[0]!.dateOfBirth, '2022-04-03')
  assert.equal(report.valid[0]!.gender, 'Female')
})

test('roster parsing preserves text credentials, quoted addresses and all guardian fields', () => {
  const csv = 'regNumber,Full Name,classLevel,pin,Class Arm,date_of_birth,gender,address,guardianName,guardianRelationship,guardianPhone,guardianEmail\r\n' +
    '000042,"Ada, Example",Primary 3,001234,A,2018-04-03,Female,"12 Road, Lagos",Guardian Example,Aunt,08012345678,guardian@example.test\r\n'
  const report = parseRosterFile(Buffer.from(csv))
  assert.deepEqual(report.errors, [])
  assert.equal(report.valid[0]!.regNumber, '000042')
  assert.equal(report.valid[0]!.pin, '001234')
  assert.equal(report.valid[0]!.arm, 'A')
  assert.equal(report.valid[0]!.dateOfBirth, '2018-04-03')
  assert.equal(report.valid[0]!.fullName, 'Ada, Example')
  assert.equal(report.valid[0]!.guardianPhone, '+2348012345678')
  assert.equal(report.valid[0]!.guardianRelationship, 'Aunt')
  assert.equal(report.valid[0]!.address, '12 Road, Lagos')
})

test('Excel date cells use their date system and formatted PINs retain leading zeros', () => {
  for (const date1904 of [false, true]) {
    const book = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['regNumber', 'fullName', 'classLevel', 'pin', 'dateOfBirth', 'guardianPhone'],
      ['X001', 'Excel Student', 'PRIMARY3', 1234, date1904 ? 41731 : 43193, '08012345678'],
    ])
    sheet.D2!.z = '000000'
    sheet.E2!.z = 'dd/mm/yyyy'
    book.Workbook = { WBProps: { date1904 } }
    XLSX.utils.book_append_sheet(book, sheet, 'Roster')
    for (const bookType of ['xlsx', 'xls'] as const) {
      const report = parseRosterFile(XLSX.write(book, { type: 'buffer', bookType }) as Buffer)
      assert.deepEqual(report.errors, [])
      assert.equal(report.valid[0]!.pin, '001234')
      assert.equal(report.valid[0]!.dateOfBirth, '2018-04-03')
      assert.equal(report.valid[0]!.guardianPhone, '+2348012345678')
    }
  }
})

test('profile errors identify actual sheet rows and incomplete guardians produce a warning', () => {
  const csv = 'regNumber,fullName,classLevel,arm,dateOfBirth,guardianName,guardianPhone,guardianEmail\n' +
    'GOOD,Good Student,JSS1,A,2013-04-03,Guardian Name,,\n\n' +
    'BAD,Bad Student,JSS1,A,2013-02-30,G,0801,invalid-email\n' +
    'FUTURE,Future Student,JSS1,A,2999-01-01,,,\n'
  const report = parseRosterFile(Buffer.from(csv))
  assert.equal(report.summary.totalRows, 3)
  assert.equal(report.summary.validRows, 1)
  assert.equal(report.summary.invalidRows, 2)
  assert.equal(report.summary.warningCount, 1)
  assert.equal(report.valid[0]!.warnings[0]!.code, 'GUARDIAN_INCOMPLETE')
  assert.deepEqual(report.errors.filter(issue => issue.row === 4).map(issue => issue.column).sort(), ['dateOfBirth', 'guardianEmail', 'guardianName', 'guardianPhone'])
  assert(report.errors.some(issue => issue.row === 5 && issue.code === 'DATE_OF_BIRTH_FUTURE'))
})

test('legacy roster columns still work and ambiguous arm headers are rejected', () => {
  const legacy = parseRosterFile(Buffer.from('regNumber,fullName,classLevel\nA001,Legacy Student,JSS1\n'))
  assert.deepEqual(legacy.errors, [])
  assert(legacy.valid[0]!.pinGenerated)
  assert.throws(() => parseRosterFile(Buffer.from('regNumber,fullName,classLevel,arm,Class Arm\nA001,Legacy Student,JSS1,A,B\n')), /Duplicate column/)
})
