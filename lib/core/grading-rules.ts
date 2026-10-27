import { conflict } from '@/lib/errors'
import type { QuestionType, SessionStatus } from '@/lib/core/domain'
import { optionOrderSeed, questionOrderSeed, seededShuffle } from '@/lib/shuffle'

/**
 * PORTABLE EXAM RULES
 * ===================
 *
 * The exam logic that must behave identically online and offline, extracted so both
 * runtimes can run the *same code* rather than two implementations that agree until they
 * quietly stop agreeing.
 *
 * PRD §3.4 step 3 says an offline exam "proceeds identically to online mode". That is a
 * correctness requirement, not a nicety: a student must see the same paper and earn the
 * same mark whichever way they sat it, or a school cannot defend a grade. Two copies of
 * a shuffle algorithm or an all-or-nothing rule would drift on the first bug fix applied
 * to one of them.
 *
 * WHAT MAY BE IMPORTED HERE: nothing with a runtime dependency on `@prisma/client`,
 * `next/*`, or a database. `lib/errors.ts` and `lib/shuffle.ts` are both import-free, so
 * this module loads cleanly on a hall server running SQLite.
 *
 * The reason this file exists at all: `lib/grading.ts` imports `lib/tenant.ts`, which
 * imports `lib/db.ts`, which calls `new PrismaClient()` at module load. Importing
 * `gradeAnswer` from there would spin up a Postgres client on a machine that has no
 * Postgres and no internet. `lib/grading.ts` now re-exports everything below, so cloud
 * code is unaffected and unchanged.
 */

/**
 * Re-exported from `lib/core/domain.ts`, where the schema's enums are restated as plain
 * string unions with no runtime import — so this module loads on a LocalServer whose
 * SQLite schema has no enums at all. Structurally identical to Prisma's generated
 * unions, so cloud and device values are mutually assignable without casts.
 */
export type { QuestionType, SessionStatus } from '@/lib/core/domain'

/* ================================================================== *
 * Student-facing paper
 * ================================================================== */

export type StudentFacingOption = { id: string; text: string; orderIndex: number }

/**
 * Note the absence of `isCorrect`, here and in `StudentFacingOption`.
 *
 * There is no field to put an answer key in, so leaking one through a student response is
 * a type error rather than something review has to catch. The cloud pairs this with
 * `STUDENT_PAPER_SELECT` (lib/grading.ts); the LocalServer must project its rows into
 * this same shape before serving them.
 */
export type StudentFacingQuestion = {
  id: string
  text: string
  type: QuestionType
  points: number
  orderIndex: number
  options: StudentFacingOption[]
}

/**
 * Apply this student's deterministic shuffle to a paper.
 *
 * Order is recomputed from the seed on every call rather than stored. That is what makes
 * an offline sitting reproducible: the hall server and the cloud derive the identical
 * permutation from `studentId + examId` with no shared state and no network (see
 * lib/shuffle.ts), so a teacher auditing the paper months later — against the cloud —
 * sees exactly what the student saw on a LAN machine that has since been reimaged.
 */
export function buildStudentPaper(
  questions: StudentFacingQuestion[],
  opts: { studentId: string; examId: string; shuffleQuestions: boolean; shuffleOptions: boolean },
): StudentFacingQuestion[] {
  const ordered = opts.shuffleQuestions
    ? seededShuffle(questions, questionOrderSeed(opts.studentId, opts.examId))
    : [...questions].sort((a, b) => a.orderIndex - b.orderIndex)

  if (!opts.shuffleOptions) return ordered

  return ordered.map((question) => ({
    ...question,
    options: seededShuffle(question.options, optionOrderSeed(opts.studentId, opts.examId, question.id)),
  }))
}

/* ================================================================== *
 * Scoring
 * ================================================================== */

export type GradableQuestion = {
  id: string
  type: QuestionType
  points: number
  options: { id: string; isCorrect: boolean }[]
}

export type GradableAnswer = {
  id: string
  questionId: string
  selectedOptionId: string | null
  /**
   * `unknown` rather than `Prisma.JsonValue`, to keep this module free of Prisma types.
   * Both a Postgres `JsonValue` and a plain `string[]` from SQLite are assignable to it,
   * and `normaliseSelection` below narrows it safely.
   */
  selectedOptionIds: unknown
}

/** Normalise either storage column into a plain set of selected option ids. */
export function normaliseSelection(answer: GradableAnswer): Set<string> {
  if (Array.isArray(answer.selectedOptionIds)) {
    return new Set(answer.selectedOptionIds.filter((id): id is string => typeof id === 'string'))
  }
  return answer.selectedOptionId ? new Set([answer.selectedOptionId]) : new Set()
}

/**
 * Grade one answer.
 *
 * MULTIPLE_CHOICE is all-or-nothing: the selected set must equal the correct set
 * exactly. v1 has no partial-credit model, and awarding half marks for a subset would
 * need a policy the PRD doesn't define (is 2-of-3 worth ⅔? does a wrong extra pick cancel
 * a right one?). All-or-nothing needs no such policy and is what WAEC/NECO-style marking
 * does.
 */
export function gradeAnswer(question: GradableQuestion, answer: GradableAnswer | undefined) {
  const correctIds = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id))

  // Unanswered — recorded explicitly as incorrect with 0 points rather than left null, so
  // per-question statistics can distinguish "wrong" from "never graded".
  if (!answer) return { isCorrect: false, pointsAwarded: 0 }

  const chosen = normaliseSelection(answer)
  if (chosen.size === 0) return { isCorrect: false, pointsAwarded: 0 }

  const isCorrect = chosen.size === correctIds.size && [...chosen].every((id) => correctIds.has(id))

  return { isCorrect, pointsAwarded: isCorrect ? question.points : 0 }
}

/* ================================================================== *
 * Answer validation
 * ================================================================== */

/**
 * Verify that every submitted option id belongs to the question being answered.
 *
 * `Answer.selectedOptionId` has a foreign key to `Option` but nothing ties it to
 * `Answer.questionId`, and `selectedOptionIds` is a JSON column with no integrity at all
 * — so the database would happily accept an answer pointing at a different question's
 * option. Since grading compares against *this* question's correct set, such a row would
 * silently grade as wrong forever. This is the check that keeps the two columns honest.
 *
 * Applied on three paths now: online autosave, offline autosave, and sync reconciliation.
 */
export function assertOptionsBelongToQuestion(
  question: { id: string; type: QuestionType; options: { id: string }[] },
  submittedIds: string[],
): void {
  const valid = new Set(question.options.map((option) => option.id))
  const stray = submittedIds.filter((id) => !valid.has(id))

  if (stray.length > 0) {
    throw conflict(`Option ${stray.join(', ')} does not belong to this question.`, 'CONFLICT')
  }

  if (question.type !== 'MULTIPLE_CHOICE' && submittedIds.length > 1) {
    throw conflict(
      `A ${question.type} question accepts a single option; ${submittedIds.length} were submitted.`,
      'CONFLICT',
    )
  }
}

/**
 * Split a selection into the two storage columns, driven by the question's own type.
 *
 * Shared so the online route, the offline route, and the sync reconciler cannot disagree
 * about which column holds what — a disagreement that would produce answers that grade as
 * permanently wrong on one path and correctly on another.
 */
export function selectionColumns(type: QuestionType, selectedOptionIds: string[]) {
  const isMulti = type === 'MULTIPLE_CHOICE'
  return {
    isMulti,
    selectedOptionId: isMulti ? null : (selectedOptionIds[0] ?? null),
    selectedOptionIdsArray: isMulti ? selectedOptionIds : null,
  }
}
