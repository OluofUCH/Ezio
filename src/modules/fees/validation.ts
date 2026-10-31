import { z } from 'zod'
import { classLevelSchema, idSchema } from '@/lib/validation/common'

export const feeQuerySchema = z.object({ termId: idSchema, classLevel: classLevelSchema.optional(), classArmId: idSchema.optional() }).strict()
export const feeStatusSchema = z.object({ termId: idSchema, classArmId: idSchema, studentId: idSchema, status: z.enum(['PAID', 'OWING']) }).strict()

export function feeRosterDate(term: { startDate: Date; endDate: Date }, now = new Date()) {
  return new Date(Math.max(term.startDate.getTime(), Math.min(now.getTime(), term.endDate.getTime())))
}
