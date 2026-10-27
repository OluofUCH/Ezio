import type { Prisma, SessionStatus } from '@prisma/client'
import { conflict } from '@/lib/errors'
import { assertAffected, type TenantDb } from '@/lib/tenant'
import { gradeAnswer, normaliseSelection } from '@/lib/core/grading-rules'
import { isWriteWindowClosed, secondsRemaining, type TimedSession } from '@/lib/timing'

/**
 * GRADING AND SESSION LIFECYCLE
 * ============================
 *
 * Two responsibilities that are really one: a session ends by being graded, whether
 * the student pressed Submit or the clock ran out.
 *
 * All auto-gradable in v1 (PRD §4.2), so a session is scored the instant it closes.
 *
 * THE RULES THEMSELVES LIVE IN `lib/core/grading-rules.ts`, not here — they have to run
 * on an offline LocalServer too, and this module reaches a Prisma client through
 * `lib/tenant.ts`. Everything portable is re-exported below so existing imports from
 * `@/lib/grading` keep working unchanged; what stays in this file is the part that
 * genuinely needs the cloud database.
 */

/**
 * Re-exported for backwards compatibility: every cloud route imports these from here.
 * Their definitions moved, their behaviour did not.
 */
export {
  buildStudentPaper,
  gradeAnswer,
  normaliseSelection,
  assertOptionsBelongToQuestion,
  selectionColumns,
} from '@/lib/core/grading-rules'

export type {
  QuestionType,
  StudentFacingOption,
  StudentFacingQuestion,
  GradableQuestion,
  GradableAnswer,
} from '@/lib/core/grading-rules'

/* ================================================================== *
 * Student-facing paper — the answer key must be structurally unreachable
 * ================================================================== */

/**
 * The ONLY Prisma select used to build a paper a student will see.
 *
 * `Option.isCorrect` is absent, and `StudentFacingQuestion` has no field to put it in —
 * so leaking the answer key is a type error rather than something that has to be caught
 * in review. A stray `include: { options: true }` on a student-facing route would
 * compile-fail against these types.
 *
 * The single sanctioned exception is `SYNC_QUESTION_SELECT` in `lib/sync/payload.ts`,
 * which a hall server needs in order to grade offline.
 */
export const STUDENT_PAPER_SELECT = {
  id: true,
  text: true,
  type: true,
  points: true,
  orderIndex: true,
  options: {
    select: { id: true, text: true, orderIndex: true },
    orderBy: { orderIndex: 'asc' },
  },
} satisfies Prisma.QuestionSelect

/* ================================================================== *
 * Scoring
 * ================================================================== */

/**
 * Select for grading — the mirror of STUDENT_PAPER_SELECT, and never sent to a student.
 *
 * Satisfies the portable `GradableQuestion` shape, so rows fetched with this select can
 * be handed straight to `gradeAnswer` from `lib/core/grading-rules.ts`.
 */
export const GRADING_SELECT = {
  id: true,
  type: true,
  points: true,
  options: { select: { id: true, isCorrect: true } },
} satisfies Prisma.QuestionSelect

/* ================================================================== *
 * Submission
 * ================================================================== */

export type SubmissionResult = {
  status: SessionStatus
  score: number
  maxScore: number
  percentage: number
  answeredCount: number
  totalQuestions: number
}

/**
 * Close and grade a session in one transaction.
 *
 * The first statement is a compare-and-set on `status`: `updateMany` with
 * `status: 'IN_PROGRESS'` in the `where`. Only one caller can flip it, so a student
 * double-tapping Submit while the deadline sweeper fires cannot produce two grading
 * passes — the loser sees `count === 0` and gets a 409. Doing this as
 * read-then-write would leave exactly that race open.
 *
 * @param status SUBMITTED for a deliberate submit, AUTO_SUBMITTED when time expired.
 */
export async function submitAndGrade(
  db: TenantDb,
  sessionId: string,
  status: Extract<SessionStatus, 'SUBMITTED' | 'AUTO_SUBMITTED'>,
): Promise<SubmissionResult> {
  return db.$transaction(async (tx) => {
    const submittedAt = new Date()

    const claimed = await tx.examSession.updateMany({
      where: { id: sessionId, status: 'IN_PROGRESS' },
      data: { status, submittedAt },
    })

    if (claimed.count === 0) {
      throw conflict('This exam session has already been submitted.', 'SESSION_ALREADY_CLOSED')
    }

    const session = await tx.examSession.findFirstOrThrow({
      where: { id: sessionId },
      select: { examId: true },
    })

    const [questions, answers] = await Promise.all([
      tx.question.findMany({ where: { examId: session.examId }, select: GRADING_SELECT }),
      tx.answer.findMany({
        where: { examSessionId: sessionId },
        select: { id: true, questionId: true, selectedOptionId: true, selectedOptionIds: true },
      }),
    ])

    const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]))

    let score = 0
    let maxScore = 0
    let answeredCount = 0

    // Group identical verdicts so grading N answers costs a couple of statements
    // rather than N round trips inside the transaction. Exams almost always use a
    // uniform point value, so this collapses to two updateMany calls.
    const verdictGroups = new Map<string, { isCorrect: boolean; pointsAwarded: number; ids: string[] }>()

    for (const question of questions) {
      maxScore += question.points
      const answer = answersByQuestion.get(question.id)
      const verdict = gradeAnswer(question, answer)
      score += verdict.pointsAwarded

      if (!answer) continue
      if (normaliseSelection(answer).size > 0) answeredCount++

      const key = `${verdict.isCorrect}:${verdict.pointsAwarded}`
      const group = verdictGroups.get(key)
      if (group) group.ids.push(answer.id)
      else verdictGroups.set(key, { ...verdict, ids: [answer.id] })
    }

    for (const group of verdictGroups.values()) {
      await tx.answer.updateMany({
        where: { id: { in: group.ids } },
        data: { isCorrect: group.isCorrect, pointsAwarded: group.pointsAwarded },
      })
    }

    await tx.examSession.updateMany({
      where: { id: sessionId },
      data: { score, maxScore },
    })

    return {
      status,
      score,
      maxScore,
      percentage: maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0,
      answeredCount,
      totalQuestions: questions.length,
    }
  }, { maxWait: 10_000, timeout: 20_000 })
}

/* ================================================================== *
 * Deadline enforcement
 * ================================================================== */

export type DeadlineCheck =
  | { expired: false; secondsRemaining: number }
  | { expired: true; secondsRemaining: 0; result: SubmissionResult }

/**
 * The auto-submit safeguard. Called at the head of EVERY session-scoped route —
 * resume, answer save, submit, heartbeat, flags.
 *
 * Because it runs before any write is considered, a client with a patched or
 * disabled countdown cannot save even one answer past the deadline: its next
 * request is what triggers its own auto-submission. The browser timer becomes
 * purely cosmetic, which is the point of PRD §4.2's "don't trust the browser".
 *
 * The one case this cannot cover is a client that never sends another request at
 * all — a closed laptop leaves a session IN_PROGRESS, because a lazy check needs
 * something to be lazy about. `POST /api/exams/[examId]/sessions/sweep-expired`
 * is the staff-facing remedy.
 */
export async function enforceSessionDeadline(
  db: TenantDb,
  session: TimedSession & { id: string; status: SessionStatus },
  now: Date = new Date(),
): Promise<DeadlineCheck> {
  if (session.status !== 'IN_PROGRESS') {
    return { expired: false, secondsRemaining: 0 }
  }

  if (!isWriteWindowClosed(session, now)) {
    return { expired: false, secondsRemaining: secondsRemaining(session, now) }
  }

  const result = await submitAndGrade(db, session.id, 'AUTO_SUBMITTED')
  return { expired: true, secondsRemaining: 0, result }
}

/**
 * Guard for routes that must refuse to proceed on an expired session.
 *
 * Auto-submits first (so the score is banked), then throws 409 with the result
 * attached — the client needs to know the exam just ended, not merely that its
 * write failed.
 */
export async function requireOpenSession(
  db: TenantDb,
  session: TimedSession & { id: string; status: SessionStatus },
  now: Date = new Date(),
): Promise<number> {
  if (session.status !== 'IN_PROGRESS') {
    throw conflict('This exam session is no longer open.', 'SESSION_ALREADY_CLOSED')
  }

  const check = await enforceSessionDeadline(db, session, now)

  if (check.expired) {
    throw conflict(
      'Time expired — this exam has been submitted automatically.',
      'SESSION_EXPIRED_AUTOSUBMITTED',
      check.result,
    )
  }

  return check.secondsRemaining
}

export { assertAffected }
