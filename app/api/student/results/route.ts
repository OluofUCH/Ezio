import { ok, readQuery, route } from '@/lib/api'
import { requireStudent } from '@/lib/auth/session'
import { pageMeta, paginate } from '@/lib/validation/common'
import { listResultsSchema } from '@/lib/validation/session'

export const runtime = 'nodejs'

/**
 * GET /api/student/results — the student's own past results.
 *
 * PRD §3.5: "Student views their own past results only." Both halves are enforced
 * structurally rather than by a filter someone has to remember: `studentId` comes from
 * the verified token, and the tenant client confines the query to their school.
 *
 * In-progress sessions are excluded — an unsubmitted paper has no score, and listing it
 * here would present a null as a result. The active session is reported by the exam
 * briefing and heartbeat endpoints instead.
 */
export const GET = route(async (req) => {
  const { session: auth, db } = await requireStudent(req)
  const query = readQuery(req, listResultsSchema)

  const where = {
    studentId: auth.studentId,
    status: { not: 'IN_PROGRESS' as const },
  }

  const [sessions, total] = await Promise.all([
    db.examSession.findMany({
      where,
      ...paginate(query),
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        /**
         * Exam metadata only. No questions, no options, and above all no `isCorrect` —
         * a results list that revealed the answer key would hand the paper to every
         * student still to sit it, since exams commonly run across several halls and
         * days. Reviewing which questions were missed is a separate teacher-mediated
         * feature, not this endpoint.
         */
        exam: {
          select: { id: true, title: true, subject: true, classLevel: true, durationMins: true },
        },
      },
    }),
    db.examSession.count({ where }),
  ])

  return ok({
    results: sessions.map((session) => ({
      sessionId: session.id,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      score: session.score,
      maxScore: session.maxScore,
      /**
       * Computed from the `maxScore` snapshotted at grading time, not from the exam's
       * current question set — so a percentage stays meaningful after a teacher edits
       * the paper for next term (see the `maxScore` note in schema.prisma).
       */
      percentage:
        session.score !== null && session.maxScore !== null && session.maxScore > 0
          ? Math.round((session.score / session.maxScore) * 10000) / 100
          : null,
      exam: session.exam,
    })),
    meta: pageMeta(total, query),
  })
})
