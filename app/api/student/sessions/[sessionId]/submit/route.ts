import { ok, route } from '@/lib/api'
import { requireStudent } from '@/lib/auth/session'
import { requireOpenSession, submitAndGrade } from '@/lib/grading'
import { resolveSession } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { sessionId: string }

/**
 * POST /api/student/sessions/[sessionId]/submit — hand in the paper.
 *
 * PRD §3.3 step 5: "submission is scored immediately (auto-gradable question types)".
 * Every v1 question type is auto-gradable, so closing and scoring are one atomic step
 * inside `submitAndGrade` rather than a queue for a marker to work through.
 *
 * No request body. Answers were already saved one at a time by the autosave route, so
 * a final bulk payload would be a second source of truth for the same data — and the
 * one most likely to be truncated by a dying connection at the moment it matters most.
 * Whatever is on the server is what gets marked.
 *
 * Double-submit is safe: `submitAndGrade` claims the session with a compare-and-set on
 * `status`, so a student double-tapping Submit produces one grading pass and one 409.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { session: auth, db } = await requireStudent(req)
  const sessionId = parseParam((await ctx.params).sessionId, 'sessionId')

  const session = await resolveSession(db, sessionId, auth.studentId)

  /**
   * If the deadline already passed, this grades the session as AUTO_SUBMITTED and
   * throws 409 `SESSION_EXPIRED_AUTOSUBMITTED` with the result attached — the score is
   * still banked, and the client is told the exam ended on the clock rather than by
   * this click. Only a genuinely open session reaches the line below.
   */
  await requireOpenSession(db, session)

  const result = await submitAndGrade(db, sessionId, 'SUBMITTED')

  return ok({
    session: {
      id: sessionId,
      status: result.status,
      submittedAt: new Date(),
    },
    result: {
      score: result.score,
      maxScore: result.maxScore,
      percentage: result.percentage,
      answeredCount: result.answeredCount,
      totalQuestions: result.totalQuestions,
      // Unanswered questions are graded as 0, so this is the honest count of what the
      // student left blank — worth surfacing on the confirmation screen.
      unansweredCount: result.totalQuestions - result.answeredCount,
    },
    exam: { id: session.examId, title: session.exam.title },
  })
})
