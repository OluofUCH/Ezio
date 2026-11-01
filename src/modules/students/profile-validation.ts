import { z } from 'zod'
import { calendarDateSchema } from '@/src/modules/shared/calendar-date'
import { parentPhoneSchema } from '@/src/modules/parents/validation'

export const STUDENT_PROFILE_HEADERS = ['dateOfBirth', 'gender', 'address', 'guardianName', 'guardianRelationship', 'guardianPhone', 'guardianEmail'] as const

const text = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable().optional()
export const studentProfileDetailsSchema = z.object({
  dateOfBirth: calendarDateSchema.or(z.literal('')).transform(value => value || null).nullable().optional(),
  gender: text(40), address: text(500),
  guardianName: z.string().trim().max(120).refine(value => !value || value.length >= 2, 'Enter the guardian’s full name.').transform(value => value ? value.replace(/\s+/g, ' ') : null).nullable().optional(),
  guardianRelationship: text(80),
  guardianPhone: parentPhoneSchema.or(z.literal('')).transform(value => value || null).nullable().optional(),
  guardianEmail: z.union([z.literal(''), z.string().trim().email().max(254)]).transform(value => value || null).nullable().optional(),
}).strict()

export type StudentProfileDetails = z.infer<typeof studentProfileDetailsSchema>

export function studentProfileDetails(input: StudentProfileDetails): StudentProfileDetails {
  return {
    dateOfBirth: input.dateOfBirth, gender: input.gender, address: input.address,
    guardianName: input.guardianName, guardianRelationship: input.guardianRelationship,
    guardianPhone: input.guardianPhone, guardianEmail: input.guardianEmail,
  }
}
