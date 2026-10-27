import { ok, route } from '@/lib/api'
import { forbidden, notFound } from '@/lib/errors'
import { requireStudent } from '@/lib/auth/session'
import { examWindowState, secondsRemaining } from '@/lib/timing'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * GET /api/student/exams/[examId] — pre-exam briefing screen.
 *
 * Metadata only: no questions, no options. The paper is served by `/start`, which is
 * what creates the session and starts the clock — so a student cannot read the
 * questions before their timer begins.
 */
export const GET = route<Params>(async (req, ctx) => {
  const { session, db } = await requireStudent(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  const student = await db.student.findFirst({
    where: { id: session.studentId },
    select: { id: true, classLevel: true },
  })
  if (!student) throw notFound('Student record not found.')

  // schoolId comes from the tenant client; another school's exam reads as 404.
  const exam = await db.exam.findFirst({
    where: { id: examId, isPublished: true },
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

  // Unpublished exams are 404 rather than 403 — a student has no business knowing
  // which drafts a teacher is working on.
  if (!exam) throw notFound('Exam not found.')

  /**
   * The class-level check, server-side. PRD §3.2 calls out exactly this attack: a
   * JSS2 student hitting the API directly with an SS1 exam id. The check is against
   * the student's database row, not the class level in their token.
   */
  if (exam.classLevel !== student.classLevel) {
    throw forbidden(
      `This exam is for ${exam.classLevel} students. You are registered as ${student.classLevel}.`,
      'WRONG_CLASS_LEVEL',
    )
  }

  const own = await db.examSession.findMany({
    where: { examId, studentId: student.id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      score: true,
      maxScore: true,
    },
    orderBy: { startedAt: 'desc' },
  })

  const now = new Date()
  const active = own.find((s) => s.status === 'IN_PROGRESS')
  const attemptsUsed = own.filter((s) => s.status !== 'IN_PROGRESS').length
  const attemptsRemaining = Math.max(0, exam.maxAttempts - attemptsUsed)
  const windowState = examWindowState(exam, now)

  const totalPoints = await db.question.aggregate({ where: { examId }, _sum: { points: true } })

  return ok({
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      classLevel: exam.classLevel,
      durationMins: exam.durationMins,
      mode: exam.mode,
      questionCount: exam._count.questions,
      totalPoints: totalPoints._sum.points ?? 0,
      startWindow: exam.startWindow,
      endWindow: exam.endWindow,
      windowState,
    },
    attempts: {
      used: attemptsUsed,
      allowed: exam.maxAttempts,
      remaining: attemptsRemaining,
      // Past attempts only; an in-progress one is reported separately.
      history: own
        .filter((s) => s.status !== 'IN_PROGRESS')
        .map((s) => ({
          id: s.id,
          status: s.status,
          submittedAt: s.submittedAt,
          score: s.score,
          maxScore: s.maxScore,
        })),
    },
    activeSession: active
      ? {
          id: active.id,
          startedAt: active.startedAt,
          secondsRemaining: secondsRemaining({ startedAt: active.startedAt, exam }, now),
        }
      : null,
    canStart: windowState === 'OPEN' && attemptsRemaining > 0 && exam._count.questions > 0 && !active,
    serverTime: now,
  })
})
