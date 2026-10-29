import { z } from 'zod'
import { idSchema, paginationSchema, emailSchema, fullNameSchema, passwordSchema } from '@/lib/validation/common'

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable().optional()
// Query strings and already-parsed service inputs share the same validator.
const activeFilter = z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]).optional()

export const teacherListSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(), isActive: activeFilter,
}).strict()
export const createTeacherSchema = z.object({ email: emailSchema, fullName: fullNameSchema, password: passwordSchema }).strict()
export const updateTeacherAccountSchema = z.object({ fullName: fullNameSchema.optional(), isActive: z.boolean().optional(), password: passwordSchema.optional() }).strict()
export const updateTeacherProfileSchema = z.object({
  phone: optionalText(40), qualifications: optionalText(1000),
}).strict().refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'Provide at least one profile field to update.',
})
export const createTeachingAssignmentSchema = z.object({
  teacherId: idSchema, subjectId: idSchema, classArmId: idSchema, academicSessionId: idSchema,
}).strict()
export const assignmentListSchema = paginationSchema.extend({
  teacherId: idSchema.optional(), subjectId: idSchema.optional(), classArmId: idSchema.optional(),
  academicSessionId: idSchema.optional(), isActive: activeFilter,
}).strict()
export const assignmentStatusSchema = z.object({ isActive: z.boolean() }).strict()
export const formTeacherSchema = z.object({ teacherId: idSchema.nullable() }).strict()

export type TeacherListInput = z.infer<typeof teacherListSchema>
export type UpdateTeacherProfileInput = z.infer<typeof updateTeacherProfileSchema>
export type CreateTeachingAssignmentInput = z.infer<typeof createTeachingAssignmentSchema>
export type AssignmentListInput = z.infer<typeof assignmentListSchema>
