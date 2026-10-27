import { ok, route } from '@/lib/api'
import { requireSchoolScope } from '@/lib/auth/session'
import { enforceSessionDeadline } from '@/lib/grading'
import { resolveExam } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * POST /api/exams/[examId]/sessions/sweep-expired — close abandoned sittings.
 *
 * The gap the lazy auto-submit cannot cover (lib/grading.ts). Every session-scoped route
 * checks the deadline before it writes, which means a student with a patched countdown
 * still cannot answer past time — but a *lazy* check needs a request to be lazy about. A
 * student who shuts the laptop lid, or whose machine dies, sends nothing further, so
 * their session sits IN_PROGRESS forever: never graded, and still occupying the partial
 * unique index that would let them start a fresh attempt.
 *
 * This is the staff-facing remedy. A teacher runs it after the hall clears and every
 * stranded paper is marked on the answers that did reach the server.
 *
 * Idempotent, and safe to run mid-exam: sessions still inside their duration are skipped,
 * not truncated. Running it early does nothing to students who are still writing.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  const exam = await resolveExam(db, examId)
  const now = new Date()

  const open = await db.examSession.findMany({
    where: { examId, status: 'IN_PROGRESS' },
    select: {
      id: true,
      status: true,
      startedAt: true,
      student: { select: { id: true, regNumber: true, fullName: true } },
    },
    orderBy: { startedAt: 'asc' },
  })

  const timing = { durationMins: exam.durationMins, endWindow: exam.endWindow }

  const submitted: Array<{
    sessionId: string
    student: { id: string; regNumber: string; fullName: string }
    score: number
    maxScore: number
    percentage: number
    answeredCount: number
    totalQuestions: number
  }> = []
  let stillRunning = 0

  /**
   * Sequential, not `Promise.all`. Each call is its own grading transaction, and firing
   * forty of them at once at a Supabase pooler configured with `connection_limit=1`
   * would queue or fail rather than go faster. A hall is tens of sessions, so the
   * wall-clock difference is irrelevant next to the risk.
   */
  for (const session of open) {
    // Re-uses the exact same deadline logic and grading path as the student-triggered
    // route, so a swept session is scored identically to a self-submitted one.
    const check = await enforceSessionDeadline(db, { ...session, exam: timing }, now)

    if (check.expired) {
      submitted.push({
        sessionId: session.id,
        student: session.student,
        score: check.result.score,
        maxScore: check.result.maxScore,
        percentage: check.result.percentage,
        answeredCount: check.result.answeredCount,
        totalQuestions: check.result.totalQuestions,
      })
    } else {
      stillRunning++
    }
  }

  return ok({
    exam: { id: exam.id, title: exam.title },
    swept: submitted.length,
    // Named so the response cannot be misread as "these were left broken" — they are
    // students legitimately still writing.
    stillRunning,
    examined: open.length,
    sessions: submitted,
    sweptAt: now,
  })
})
