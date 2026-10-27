import type { Prisma } from '@prisma/client'

/**
 * THE SYNC CONTRACT
 * =================
 *
 * The shape of the pull-down payload (PRD §3.4 step 1, §4.3), defined once here and
 * imported by *both* sides: the cloud route that builds it and the LocalServer that
 * consumes it. A drift between the two would only show up on exam day in a hall with no
 * internet, which is the worst possible place to discover a missing field.
 *
 * WHAT THIS PAYLOAD CONTAINS, STATED PLAINLY
 * ------------------------------------------
 * Two things that never leave the cloud through any other route:
 *
 *   1. `options[].isCorrect` — the answer key. The hall server grades with no internet,
 *      so it must hold it. Every student-facing cloud route selects through
 *      `STUDENT_PAPER_SELECT`, which has no such field (lib/grading.ts); this is the
 *      deliberate exception, not an oversight.
 *   2. `students[].pin` — the class's login credentials in plaintext. Offline login
 *      compares against them locally via `validateStudentCredentials`, so there is no
 *      alternative. `schema.prisma` sanctions exactly this ("safe to cache on a
 *      LocalServer without exposing real account credentials") — the PIN is a
 *      throwaway exam credential precisely so this cache is survivable.
 *
 * The exposure is bounded on purpose: one exam and one class level per pull, never a
 * whole school. It still means physical control of the hall machine matters, which is
 * why `docs/offline-lan.md` says so.
 */

/** Questions as the LocalServer needs them — the mirror of `STUDENT_PAPER_SELECT`, with the key. */
export const SYNC_QUESTION_SELECT = {
  id: true,
  text: true,
  type: true,
  points: true,
  orderIndex: true,
  options: {
    select: { id: true, text: true, isCorrect: true, orderIndex: true },
    orderBy: { orderIndex: 'asc' },
  },
} satisfies Prisma.QuestionSelect

/**
 * Roster fields for offline login.
 *
 * `id` is included and matters more than it looks: the LocalServer stores the *cloud's*
 * student id and sends it back on push. That is what lets the cloud attach an offline
 * result to the right student without any name matching.
 */
export const SYNC_STUDENT_SELECT = {
  id: true,
  regNumber: true,
  pin: true,
  fullName: true,
  classLevel: true,
} satisfies Prisma.StudentSelect

export const SYNC_EXAM_SELECT = {
  id: true,
  title: true,
  subject: true,
  classLevel: true,
  durationMins: true,
  mode: true,
  shuffleQuestions: true,
  shuffleOptions: true,
  maxAttempts: true,
  startWindow: true,
  endWindow: true,
  isPublished: true,
} satisfies Prisma.ExamSelect

/**
 * The full pull payload.
 *
 * Dates are serialised as ISO strings over the wire, so this is written in terms of
 * `string` rather than `Date` — the LocalServer parses them back itself. Typing them as
 * `Date` here would be a lie that only surfaces as a runtime error on the device.
 */
export type SyncPullPayload = {
  /** Identifies the pull for the device's own logging, and proves which key was used. */
  localServer: { id: string; name: string }
  /**
   * `slug` is required, not decorative: `validateStudentCredentials` resolves a student
   * by (schoolSlug, regNumber), so the device cannot authenticate anyone without it.
   */
  school: { id: string; name: string; slug: string }
  exam: {
    id: string
    title: string
    subject: string
    classLevel: string
    durationMins: number
    mode: string
    shuffleQuestions: boolean
    shuffleOptions: boolean
    maxAttempts: number
    startWindow: string | null
    endWindow: string | null
    isPublished: boolean
  }
  questions: Array<{
    id: string
    text: string
    type: string
    points: number
    orderIndex: number
    options: Array<{ id: string; text: string; isCorrect: boolean; orderIndex: number }>
  }>
  students: Array<{
    id: string
    regNumber: string
    pin: string
    fullName: string
    classLevel: string
  }>
  meta: {
    /** Cloud clock at generation. The device warns if its own clock is far from this. */
    generatedAt: string
    questionCount: number
    studentCount: number
    totalPoints: number
  }
}

/* ------------------------------------------------------------------ *
 * Push outcomes
 * ------------------------------------------------------------------ */

/**
 * Per-session result of a push, so a partially-rejected batch is actionable.
 *
 * `ALREADY_SYNCED` is a success, not an error: it is what a retry after a dropped
 * connection must return, and the device clears its local `syncedAt: null` flag on it
 * exactly as it would on `CREATED`. Without that distinction a flaky link would make a
 * device retry the same batch forever.
 */
export type PushOutcome =
  | { localId: string; outcome: 'CREATED'; sessionId: string; score: number; maxScore: number }
  | { localId: string; outcome: 'UPDATED'; sessionId: string; score: number; maxScore: number }
  | { localId: string; outcome: 'ALREADY_SYNCED'; sessionId: string }
  | { localId: string; outcome: 'REJECTED'; reason: string }

export type SyncPushResult = {
  localServer: { id: string; name: string }
  created: number
  updated: number
  alreadySynced: number
  rejected: number
  results: PushOutcome[]
  syncedAt: string
}
