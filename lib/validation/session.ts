import { z } from 'zod'
import { classLevelSchema, paginationSchema } from '@/lib/validation/common'

/* ------------------------------------------------------------------ *
 * Answer autosave
 * ------------------------------------------------------------------ */

/**
 * One unified input shape for all three question types, rather than mirroring the
 * schema's `selectedOptionId` / `selectedOptionIds` split. The route maps this onto
 * the right column based on the question's own `type`, so a client cannot create
 * the contradictory state of both columns being populated.
 *
 * An empty array is meaningful: it clears a previously saved answer, which is what
 * happens when a student deselects a radio option before moving on.
 */
export const saveAnswerSchema = z
  .object({
    selectedOptionIds: z
      .array(z.string().min(1).max(64))
      .max(4, 'A question has at most 4 options.')
      // De-duplicate rather than reject: a double-tap on a touch device is a
      // client artefact, not something a student should see an error for.
      .transform((ids) => [...new Set(ids)]),
  })
  .strict()

export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>

/* ------------------------------------------------------------------ *
 * Security flags (PRD §4.4 — logged, never auto-penalised in v1)
 * ------------------------------------------------------------------ */

export const securityFlagSchema = z
  .object({
    type: z.enum(['TAB_BLUR', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'COPY_ATTEMPT', 'PASTE_ATTEMPT', 'DEVTOOLS_OPEN']),
    // No client timestamp field. The server stamps `at` when it records the event;
    // accepting a browser clock would let the log be back- or forward-dated.
  })
  .strict()

export const appendFlagsSchema = z
  .object({
    events: z.array(securityFlagSchema).min(1).max(50),
  })
  .strict()

/**
 * Ceiling on flags retained per session. A tab-blur handler on a flaky device can
 * fire hundreds of times; `securityFlags` is a single JSON column, and letting it
 * grow without bound would bloat every read of the session. Oldest are dropped.
 */
export const MAX_SECURITY_FLAGS = 200

export type SecurityFlagEvent = z.infer<typeof securityFlagSchema>

/** What actually gets persisted — server-stamped. */
export type StoredSecurityFlag = { type: SecurityFlagEvent['type']; at: string }

/* ------------------------------------------------------------------ *
 * Listing
 * ------------------------------------------------------------------ */

export const listSessionsSchema = paginationSchema.extend({
  status: z.enum(['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'FLAGGED']).optional(),
  classLevel: classLevelSchema.optional(),
})

export const listResultsSchema = paginationSchema
