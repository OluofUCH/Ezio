import assert from 'node:assert/strict'
import test from 'node:test'
import { feeQuerySchema, feeRosterDate, feeStatusSchema } from '../src/modules/fees/validation'

test('fee records accept only paid/owing status and cannot choose their author or school', () => {
  const input = { termId: 'term', classArmId: 'arm', studentId: 'student', status: 'PAID' }
  assert(feeStatusSchema.safeParse(input).success)
  for (const extra of [{ status: 'PARTIAL' }, { amount: 1000 }, { updatedById: 'other' }, { schoolId: 'other' }]) assert.equal(feeStatusSchema.safeParse({ ...input, ...extra }).success, false)
  assert(feeQuerySchema.safeParse({ termId: 'term', classLevel: 'PRIMARY6' }).success)
})

test('fee rosters use today within a term and preserve historical/future term boundaries', () => {
  const term = { startDate: new Date('2026-09-01Z'), endDate: new Date('2026-12-18Z') }
  assert.equal(feeRosterDate(term, new Date('2026-10-31Z')).toISOString(), '2026-10-31T00:00:00.000Z')
  assert.equal(feeRosterDate(term, new Date('2027-01-01Z')).getTime(), term.endDate.getTime())
  assert.equal(feeRosterDate(term, new Date('2026-01-01Z')).getTime(), term.startDate.getTime())
})
