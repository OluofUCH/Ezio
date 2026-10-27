import { ok, route } from '@/lib/api'
import { requireStudent } from '@/lib/auth/session'
import { enforceSessionDeadline } from '@/lib/grading'
import { resolveSession } from '@/lib/tenant'
import { sessionDeadline } from '@/lib/timing'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { sessionId: string }

/**
 * GET /api/student/sessions/[sessionId] — heartbeat and progress.
 *
 * The client's countdown is cosmetic (PRD §4.2). This is where it resynchronises with
 * the server's clock, which means a browser tab that was suspended, throttled by a
 * power-saving phone, or running on a machine with a wrong system time still ends the
 * exam at the right moment.
 *
 * Deliberately does NOT return the paper. A heartbeat polled every few seconds by every
 * device in a hall must stay small; re-fetching the questions belongs to
 * `POST /api/student/exams/[examId]/start`, which resumes an open session and returns
 * the paper with saved answers restored.
 *
 * Safe to call on a closed session — a client that reconnects after its exam ended needs
 * to read the outcome, so this reports the final state rather than erroring.
 */
export const GET = route<Params>(async (req, ctx) => {
  const { session: auth, db } = await requireStudent(req)
  const sessionId = parseParam((await ctx.params).sessionId, 'sessionId')

  const session = await resolveSession(db, sessionId, auth.studentId)
  const now = new Date()

  /**
   * The lazy auto-submit. A poll arriving after the deadline is what closes and grades
   * the session — so a student who simply stops interacting still gets marked, without
   * any scheduled job. `enforceSessionDeadline` returns rather than throws here: this is
   * a read, and the natural answer to "how is my session doing?" is "it just ended, here
   * is the score".
   */
  const check = await enforceSessionDeadline(db, session, now)

  const [answeredCount, totalQuestions] = await Promise.all([
    db.answer.count({ where: { examSessionId: sessionId } }),
    db.question.count({ where: { examId: session.examId } }),
  ])

  // Re-read only when the deadline check changed the row, so the response reports the
  // banked score rather than the pre-grading nulls.
  const closed = check.expired
    ? await db.examSession.findFirst({
        where: { id: sessionId },
        select: { status: true, submittedAt: true, score: true, maxScore: true },
      })
    : null

  const status = closed?.status ?? session.status
  const isOpen = status === 'IN_PROGRESS'

  return ok({
    session: {
      id: sessionId,
      status,
      startedAt: session.startedAt,
      submittedAt: closed?.submittedAt ?? session.submittedAt,
      deadline: sessionDeadline(session),
      // Zero once closed. The client should stop its timer and navigate away.
      secondsRemaining: isOpen ? check.secondsRemaining : 0,
    },
    progress: {
      answeredCount,
      totalQuestions,
      unansweredCount: Math.max(0, totalQuestions - answeredCount),
    },
    /**
     * Set only on the poll that discovered the expiry, so the client can tell "time ran
     * out just now, here is your score" apart from "this session was already over when I
     * reconnected".
     */
    autoSubmitted: check.expired ? check.result : null,
    result: isOpen
      ? null
      : {
          score: closed?.score ?? session.score,
          maxScore: closed?.maxScore ?? session.maxScore,
        },
    serverTime: now,
  })
})
