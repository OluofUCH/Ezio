import { z } from 'zod'

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Use a real calendar date in YYYY-MM-DD format.')

export function asDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}
