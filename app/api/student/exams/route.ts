import { ok, route } from '@/lib/api'
import { notFound } from '@/lib/errors'
import { requireStudent } from '@/lib/auth/session'
import { examWindowState, secondsRemaining } from '@/lib/timing'

export const runtime = 'nodejs'

/**
 * GET /api/student/exams — the exams this student may take.
 *
 * PRD §3.3 step 2 and §4.2: "a JSS2 student never sees SS1 exams", enforced by the
 * query rather than by the UI. Two filters do it, and neither is influenceable by
 * the request:
 *
 *   - `schoolId`   injected by the tenant client from the session token
 *   - `classLevel` read live from the student's own row
 *
 * The class level is re-read from the database rather than taken from the token, so
 * a student promoted while holding a live token sees the right list immediately.
 */
export const GET = route(async (req) => {
  const { session, db } = await requireStudent(req)

  const student = await db.student.findFirst({
    where: { id: session.studentId },
    select: { id: true, classLevel: true, fullName: true },
  })
  if (!student) throw notFound('Student record not found.')

  const exams = await db.exam.findMany({
    where: {
      classLevel: student.classLevel,
      isPublished: true,
      // Note: no window filter here. An exam outside its window is still listed, with
      // a state of NOT_YET_OPEN or CLOSED — a student needs to see that tomorrow's
      // exam exists, and silently omitting a closed one looks like a system fault.
    },
    orderBy: [{ startWindow: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      subject: true,
      classLevel: true,
      durationMins: true,
      mode: true,
      maxAttempts: true,
      startWindow: true,
      endWindow: true,
      _count: { select: { questions: true } },
    },
  })

  // One query for every session this student holds across the listed exams, rather
  // than one per exam.
  const sessions = exams.length
    ? await db.examSession.findMany({
        where: { studentId: student.id, examId: { in: exams.map((exam) => exam.id) } },
        select: { id: true, examId: true, status: true, startedAt: true, score: true, maxScore: true },
      })
    : []

  const now = new Date()

  const payload = exams.map((exam) => {
    const own = sessions.filter((s) => s.examId === exam.id)
    const active = own.find((s) => s.status === 'IN_PROGRESS')
    // A closed session is a consumed attempt, whether submitted deliberately, by the
    // timer, or flagged.
    const attemptsUsed = own.filter((s) => s.status !== 'IN_PROGRESS').length
    const windowState = examWindowState(exam, now)

    const attemptsRemaining = Math.max(0, exam.maxAttempts - attemptsUsed)

    return {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      classLevel: exam.classLevel,
      durationMins: exam.durationMins,
      mode: exam.mode,
      questionCount: exam._count.questions,
      startWindow: exam.startWindow,
      endWindow: exam.endWindow,
      windowState,
      attemptsUsed,
      attemptsRemaining,
      activeSession: active
        ? {
            id: active.id,
            startedAt: active.startedAt,
            secondsRemaining: secondsRemaining({ startedAt: active.startedAt, exam }, now),
          }
        : null,
      // Resolved server-side so the client does not have to re-derive the rule.
      canStart: windowState === 'OPEN' && attemptsRemaining > 0 && exam._count.questions > 0 && !active,
      canResume: Boolean(active),
    }
  })

  return ok({
    student: { id: student.id, fullName: student.fullName, classLevel: student.classLevel },
    exams: payload,
    serverTime: now,
  })
})
