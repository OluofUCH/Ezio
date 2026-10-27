import { z } from 'zod'
import { questionTypeSchema } from '@/lib/validation/common'

/**
 * THE canonical question shape.
 *
 * `questionDraftSchema` is used by three callers, deliberately:
 *
 *   1. Manual single-question entry  (POST /api/exams/[id]/questions)
 *   2. The .xlsx parser              (lib/import/questions-xlsx.ts, per row)
 *   3. The confirm-import endpoint   (POST /api/exams/[id]/questions/import)
 *
 * (3) matters most. The rows arriving there were produced by (2), but they travel
 * out to the client for preview and back in again — at which point they are
 * ordinary user input. Re-running the *same* schema is what stops a hand-rolled
 * POST to /import from bypassing every rule the uploader enforces.
 */

export const optionDraftSchema = z
  .object({
    text: z.string().trim().min(1, 'Option text cannot be empty.').max(500),
    isCorrect: z.boolean(),
  })
  .strict()

export const questionDraftSchema = z
  .object({
    text: z.string().trim().min(1, 'Question text is required.').max(2000),
    type: questionTypeSchema,
    points: z.number().int('Points must be a whole number.').min(1).max(100).default(1),
    // Template caps at optionA–optionD (PRD §4.2a); minimum of 2 is the PRD's own rule.
    options: z
      .array(optionDraftSchema)
      .min(2, 'A question needs at least 2 options.')
      .max(4, 'A question can have at most 4 options.'),
  })
  .strict()
  .superRefine((question, ctx) => {
    const correctCount = question.options.filter((option) => option.isCorrect).length

    if (correctCount === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'At least one option must be marked correct — the question would be ungradable.',
      })
    }

    if (question.type === 'SINGLE_CHOICE' && correctCount > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `A SINGLE_CHOICE question must have exactly one correct option (found ${correctCount}). Use MULTIPLE_CHOICE instead.`,
      })
    }

    if (question.type === 'TRUE_FALSE') {
      if (question.options.length !== 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: `A TRUE_FALSE question must have exactly 2 options (found ${question.options.length}).`,
        })
      }
      if (correctCount > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'A TRUE_FALSE question must have exactly one correct option.',
        })
      }
    }

    // MULTIPLE_CHOICE with a single correct option is permitted — it is a warning
    // surfaced by the parser, not an error. Rejecting it would fail rosters of
    // legitimate questions over a stylistic choice.

    const seen = new Set<string>()
    question.options.forEach((option, index) => {
      const key = option.text.trim().toLowerCase()
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['options', index, 'text'],
          message: `Duplicate option text "${option.text}".`,
        })
      }
      seen.add(key)
    })
  })

export type QuestionDraft = z.infer<typeof questionDraftSchema>

/* ------------------------------------------------------------------ *
 * Manual entry
 * ------------------------------------------------------------------ */

export const createQuestionSchema = questionDraftSchema

/**
 * A manual edit replaces the option set wholesale rather than patching options
 * individually. Options carry `isCorrect`, so a partial update invites a state
 * where a question briefly has zero or two correct answers; replacing the set
 * keeps every intermediate state valid.
 */
export const updateQuestionSchema = questionDraftSchema

export const reorderQuestionsSchema = z
  .object({
    /** Every question id belonging to the exam, in the desired display order. */
    questionIds: z.array(z.string().min(1)).min(1),
  })
  .strict()

/* ------------------------------------------------------------------ *
 * Bulk import
 * ------------------------------------------------------------------ */

export const importQuestionsSchema = z
  .object({
    /**
     * APPEND continues `orderIndex` from the existing maximum.
     * REPLACE deletes the exam's current questions first — refused outright once
     * any ExamSession exists, since it would orphan recorded answers.
     */
    mode: z.enum(['APPEND', 'REPLACE']).default('APPEND'),
    rows: z
      .array(questionDraftSchema)
      .min(1, 'No questions to import.')
      .max(500, 'Import at most 500 questions per request.'),
  })
  .strict()

export type ImportQuestionsInput = z.infer<typeof importQuestionsSchema>
