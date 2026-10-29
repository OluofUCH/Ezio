import assert from 'node:assert/strict'
import test from 'node:test'
import { assessmentSchema, gradeFor, money, rankedTotals, scaleCbt } from '../src/modules/results/rules'
import { attendanceTotals } from '../src/modules/attendance/service'
import { announcementSchema } from '../src/modules/announcements/service'
import { parseRosterFile } from '../lib/import/students-csv'

const components = [
  { name: 'CA1', maxScore: 20, orderIndex: 0 },
  { name: 'CA2', maxScore: 20, orderIndex: 1 },
  { name: 'Exam', maxScore: 60, orderIndex: 2 },
]
const bands = [
  { minScore: 0, maxScore: 39.99, grade: 'F', remark: 'Fail' },
  { minScore: 40, maxScore: 59.99, grade: 'C', remark: 'Credit' },
  { minScore: 60, maxScore: 100, grade: 'A', remark: 'Excellent' },
]

test('assessment components must total exactly 100 and grade bands cover every cent', () => {
  assert.equal(assessmentSchema.safeParse({ components, bands }).success, true)
  assert.equal(assessmentSchema.safeParse({ components: components.slice(0, 2), bands }).success, false)
  assert.equal(assessmentSchema.safeParse({ components, bands: [bands[0], { ...bands[1], minScore: 41 }, bands[2]] }).success, false)
  assert.equal(assessmentSchema.safeParse({ components, bands: [bands[0], { ...bands[1], minScore: 39 }, bands[2]] }).success, false)
  assert.equal(assessmentSchema.safeParse({ components, bands: [bands[0], bands[1]] }).success, false)
})

test('totals use two-decimal half-up rounding and grades include boundaries', () => {
  assert.equal(money('1.005').toFixed(2), '1.01')
  assert.deepEqual(gradeFor(39.99, bands), { grade: 'F', remark: 'Fail' })
  assert.deepEqual(gradeFor(40, bands), { grade: 'C', remark: 'Credit' })
  assert.deepEqual(gradeFor(60, bands), { grade: 'A', remark: 'Excellent' })
  assert.deepEqual(gradeFor(100, bands), { grade: 'A', remark: 'Excellent' })
})

test('competition ranking gives tied totals the same position and skips the next place', () => {
  const ranked = rankedTotals([
    { id: 'a', totals: [90, 80] },
    { id: 'b', totals: [80, 80] },
    { id: 'c', totals: [70, 90] },
    { id: 'd', totals: [60, 70] },
  ])
  assert.deepEqual(ranked.map((row) => [row.id, row.position, row.total.toNumber(), row.average.toNumber()]), [
    ['a', 1, 170, 85], ['b', 2, 160, 80], ['c', 2, 160, 80], ['d', 4, 130, 65],
  ])
})

test('CBT scaling uses raw earned points/current total and rounds to two decimals', () => {
  assert.equal(scaleCbt(7, 9, 60).toFixed(2), '46.67')
  assert.equal(scaleCbt(0, 9, 60).toFixed(2), '0.00')
  assert.throws(() => scaleCbt(1, 0, 60), /positive/)
})

test('attendance rate treats late as attended and leaves an empty summary blank', () => {
  assert.deepEqual(attendanceTotals([]), { present: 0, late: 0, absent: 0, marked: 0, rate: null })
  assert.deepEqual(attendanceTotals([{ status: 'PRESENT' }, { status: 'LATE' }, { status: 'ABSENT' }]), { present: 1, late: 1, absent: 1, marked: 3, rate: 66.67 })
})

test('announcement targets are structurally tied to their audience', () => {
  assert.equal(announcementSchema.safeParse({ title: 'Staff', body: 'Hello', audience: 'ALL_STAFF' }).success, true)
  assert.equal(announcementSchema.safeParse({ title: 'Role', body: 'Hello', audience: 'ROLE', targetRole: 'TEACHER' }).success, true)
  assert.equal(announcementSchema.safeParse({ title: 'Arm', body: 'Hello', audience: 'CLASS_ARM', classArmId: 'arm' }).success, true)
  assert.equal(announcementSchema.safeParse({ title: 'Leak', body: 'Hello', audience: 'ALL_STAFF', classArmId: 'arm' }).success, false)
  assert.equal(announcementSchema.safeParse({ title: 'Missing', body: 'Hello', audience: 'ROLE' }).success, false)
})

test('student roster parser accepts an optional arm and preserves leading-zero PINs', () => {
  const report = parseRosterFile(Buffer.from('regNumber,fullName,classLevel,pin,arm\nA01,Ada Student,JS2,001234,Blue\n'))
  assert.equal(report.errors.length, 0)
  assert.deepEqual(report.valid[0] && { classLevel: report.valid[0].classLevel, pin: report.valid[0].pin, arm: report.valid[0].arm }, { classLevel: 'JSS2', pin: '001234', arm: 'Blue' })
})
