import { z } from 'zod'
import { classLevelSchema, examModeSchema, paginationSchema } from '@/lib/validation/common'

/* ------------------------------------------------------------------ *
 * Exams
 * ------------------------------------------------------------------ */

const titleSchema = z.string().trim().min(3, 'Exam title is required.').max(200)
const subjectSchema = z.string().trim().min(2, 'Subject is required.').max(120)

/** 5 minutes to 8 hours. The ceiling is what the auto-submit deadline is derived from. */
const durationSchema = z
  .number()
  .int('Duration must be a whole number of minutes.')
  .min(5, 'Duration must be at least 5 minutes.')
  .max(480, 'Duration cannot exceed 8 hours.')

const isoDateSchema = z.coerce.date()

const examWindowRefinement = <T extends { startWindow?: Date | null; endWindow?: Date | null }>(value: T) =>
  !value.startWindow || !value.endWindow || value.startWindow < value.endWindow

export const createExamSchema = z
  .object({
    title: titleSchema,
    subject: subjectSchema,
    /**
     * Required and enum-checked. This is the field the entire class-targeting rule
     * hangs off (PRD §4.2) — a free-text class level would make the server-side
     * check unenforceable.
     */
    classLevel: classLevelSchema,
    durationMins: durationSchema,
    mode: examModeSchema.default('HYBRID'),
    shuffleQuestions: z.boolean().default(true),
    shuffleOptions: z.boolean().default(true),
    maxAttempts: z.number().int().min(1).max(10).default(1),
    startWindow: isoDateSchema.nullish(),
    endWindow: isoDateSchema.nullish(),
  })
  .strict()
  .refine(examWindowRefinement, {
    message: 'startWindow must be earlier than endWindow.',
    path: ['endWindow'],
  })

export const updateExamSchema = z
  .object({
    title: titleSchema.optional(),
    subject: subjectSchema.optional(),
    classLevel: classLevelSchema.optional(),
    durationMins: durationSchema.optional(),
    mode: examModeSchema.optional(),
    shuffleQuestions: z.boolean().optional(),
    shuffleOptions: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
    startWindow: isoDateSchema.nullish(),
    endWindow: isoDateSchema.nullish(),
    // `isPublished` is absent on purpose — publishing runs guard checks
    // (at least one question, coherent window) and has its own endpoint.
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update.' })
  .refine(examWindowRefinement, {
    message: 'startWindow must be earlier than endWindow.',
    path: ['endWindow'],
  })

export const publishExamSchema = z
  .object({
    /** `false` un-publishes, which is how a teacher pulls a mistake back. */
    isPublished: z.boolean(),
  })
  .strict()

export const listExamsSchema = paginationSchema.extend({
  classLevel: classLevelSchema.optional(),
  subject: z.string().trim().max(120).optional(),
  isPublished: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().trim().max(100).optional(),
})

export type CreateExamInput = z.infer<typeof createExamSchema>
export type UpdateExamInput = z.infer<typeof updateExamSchema>
