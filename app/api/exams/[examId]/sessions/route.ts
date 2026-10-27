import { ok, readQuery, route } from '@/lib/api'
import { requireSchoolScope } from '@/lib/auth/session'
import { resolveExam } from '@/lib/tenant'
import { secondsRemaining, sessionDeadline } from '@/lib/timing'
import { pageMeta, paginate, parseParam } from '@/lib/validation/common'
import { listSessionsSchema } from '@/lib/validation/session'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * GET /api/exams/[examId]/sessions — invigilation view for one exam.
 *
 * Live monitoring while a hall is sitting: who has started, who is still writing, how
 * long each has left, who tripped a security flag. This is not the M3 analytics work
 * (score distributions, per-question difficulty) — it is the screen a teacher watches
 * during the exam rather than a report they read after it.
 *
 * Scores are visible to staff here, unlike on the student-facing routes, but the answer
 * key still is not: no question or option data is selected.
 */
export const GET = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  // 404s another school's exam before any session is read.
  const exam = await resolveExam(db, examId)

  const query = readQuery(req, listSessionsSchema)

  const where = {
    examId,
    ...(query.status ? { status: query.status } : {}),
    /**
     * An exam has exactly one `classLevel`, so this filters on the *student's* level.
     * Normally identical to the exam's — but it surfaces the mismatch if a student was
     * promoted to the next class after sitting the paper, which is otherwise invisible
     * and would quietly distort a class-by-class report.
     */
    ...(query.classLevel ? { student: { classLevel: query.classLevel } } : {}),
  }

  const [sessions, total] = await Promise.all([
    db.examSession.findMany({
      where,
      ...paginate(query),
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        score: true,
        maxScore: true,
        securityFlags: true,
        syncedAt: true,
        localServerId: true,
        student: { select: { id: true, regNumber: true, fullName: true, classLevel: true } },
        _count: { select: { answers: true } },
      },
    }),
    db.examSession.count({ where }),
  ])

  const now = new Date()
  const timing = { durationMins: exam.durationMins, endWindow: exam.endWindow }

  return ok({
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      classLevel: exam.classLevel,
      durationMins: exam.durationMins,
      isPublished: exam.isPublished,
    },
    sessions: sessions.map((session) => {
      const flags = Array.isArray(session.securityFlags) ? session.securityFlags : []
      const isOpen = session.status === 'IN_PROGRESS'

      return {
        id: session.id,
        student: session.student,
        status: session.status,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        answeredCount: session._count.answers,
        score: session.score,
        maxScore: session.maxScore,
        percentage:
          session.score !== null && session.maxScore !== null && session.maxScore > 0
            ? Math.round((session.score / session.maxScore) * 10000) / 100
            : null,
        deadline: isOpen ? sessionDeadline({ startedAt: session.startedAt, exam: timing }) : null,
        secondsRemaining: isOpen
          ? secondsRemaining({ startedAt: session.startedAt, exam: timing }, now)
          : 0,
        /**
         * A session whose clock has run out but which is still IN_PROGRESS — the student
         * closed the laptop or lost the network, so no request of theirs has arrived to
         * trigger the lazy auto-submit. These are what `sweep-expired` clears.
         */
        awaitingAutoSubmit:
          isOpen && secondsRemaining({ startedAt: session.startedAt, exam: timing }, now) === 0,
        securityFlagCount: flags.length,
        securityFlags: flags,
        // Offline provenance (PRD §3.4). Null/null means the sitting happened online.
        localServerId: session.localServerId,
        syncedAt: session.syncedAt,
      }
    }),
    meta: pageMeta(total, query),
  })
})
