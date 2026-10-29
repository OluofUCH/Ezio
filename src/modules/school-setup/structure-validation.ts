import { z } from 'zod'
import { classLevelSchema } from '@/lib/validation/common'

const name = z.string().trim().min(1, 'Enter a name.').max(120)
  .transform((value) => value.replace(/\s+/g, ' '))

export const createClassArmSchema = z.object({ level: classLevelSchema, name }).strict()
export const createSubjectSchema = z.object({ name }).strict()
export const structureQuerySchema = z.object({}).strict()
export const setDefaultArmSchema = z.object({}).strict()

export type CreateClassArmInput = z.infer<typeof createClassArmSchema>
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>
