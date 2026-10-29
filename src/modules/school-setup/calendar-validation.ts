import { z } from 'zod'
import { calendarDateSchema } from '@/src/modules/shared/calendar-date'

const period = z.object({
  name: z.string().trim().min(1).max(120),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
}).strict()
const ordered = (value: { startDate: string; endDate: string }) => value.startDate <= value.endDate
const orderMessage = { message: 'The end date must be on or after the start date.', path: ['endDate'] }

// Activation is an enrollment/arm operation, not a flag that calendar creation may toggle.
export const createAcademicSessionSchema = period.refine(ordered, orderMessage)
export const createTermSchema = period.extend({ orderIndex: z.number().int().min(1).max(2147483647) })
  .strict().refine(ordered, orderMessage)
export const calendarQuerySchema = z.object({}).strict()

export type CreateAcademicSessionInput = z.infer<typeof createAcademicSessionSchema>
export type CreateTermInput = z.infer<typeof createTermSchema>
