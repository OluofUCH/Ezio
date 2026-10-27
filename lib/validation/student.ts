import { z } from 'zod'
import { classLevelSchema, fullNameSchema, paginationSchema, pinSchema, regNumberSchema } from '@/lib/validation/common'

/* ------------------------------------------------------------------ *
 * Students
 *
 * `schoolId` appears in none of these schemas. It is injected by the tenant
 * client from the session token — accepting it here is exactly the bypass the
 * brief calls out (a school admin changing an id to reach another school).
 * ------------------------------------------------------------------ */

export const createStudentSchema = z
  .object({
    regNumber: regNumberSchema,
    fullName: fullNameSchema,
    classLevel: classLevelSchema,
    /** Omit to have a cryptographically random PIN generated and returned once. */
    pin: pinSchema.optional(),
  })
  .strict()

export const updateStudentSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    /**
     * Promotion between class levels. Permitted, but note the consequence: the
     * student immediately stops seeing exams for their old level, and any
     * IN_PROGRESS session for one becomes unresumable. The route blocks the change
     * while a session is open rather than stranding a student mid-exam.
     */
    classLevel: classLevelSchema.optional(),
    pin: pinSchema.optional(),
    // `regNumber` is omitted — it is the login identifier and the unique key.
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update.' })

export const listStudentsSchema = paginationSchema.extend({
  classLevel: classLevelSchema.optional(),
  search: z.string().trim().max(100).optional(),
})

/* ------------------------------------------------------------------ *
 * Roster CSV import
 * ------------------------------------------------------------------ */

export const importStudentsQuerySchema = z.object({
  /**
   * Validate and report without writing. Distinct from the two-step preview/commit
   * flow used for questions: a roster row has no editable derived structure, so a
   * dry run plus a re-upload is the whole review loop.
   */
  dryRun: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

/**
 * Class-level spellings accepted from a spreadsheet, mapped onto the enum.
 *
 * The PRD itself writes "JS2" in §3.2 while the schema enum is `JSS2`, and
 * Nigerian schools write both that and `SSS1` for senior classes. Rejecting a
 * roster over an `S` is a support ticket, not a validation win.
 */
const CLASS_LEVEL_ALIASES: Record<string, string> = {
  JS1: 'JSS1',
  JS2: 'JSS2',
  JS3: 'JSS3',
  JSS1: 'JSS1',
  JSS2: 'JSS2',
  JSS3: 'JSS3',
  SS1: 'SS1',
  SS2: 'SS2',
  SS3: 'SS3',
  SSS1: 'SS1',
  SSS2: 'SS2',
  SSS3: 'SS3',
}

/** Normalise a spreadsheet cell to a `ClassLevel`, or null if unrecognisable. */
export function normaliseClassLevel(raw: string): string | null {
  const key = raw.trim().toUpperCase().replace(/[\s_-]/g, '')
  return CLASS_LEVEL_ALIASES[key] ?? null
}

export const ACCEPTED_CLASS_LEVEL_SPELLINGS = Object.keys(CLASS_LEVEL_ALIASES)

export type CreateStudentInput = z.infer<typeof createStudentSchema>
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>
