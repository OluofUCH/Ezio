import { ok, route } from '@/lib/api'
import { notFound } from '@/lib/errors'
import { requireStudent } from '@/lib/auth/session'
import { secondsRemaining } from '@/lib/timing'

export const runtime = 'nodejs'

/**
 * GET /api/auth/student/me — rehydrate a student session on page load.
 *
 * Also reports any session still IN_PROGRESS, so a student returning after a
 * browser crash is offered "resume your exam" rather than having to find it. The
 * remaining time comes from the server, never from whatever the old tab believed.
 */
export const GET = route(async (req) => {
  const { session, db } = await requireStudent(req)

  const student = await db.student.findFirst({
    where: { id: session.studentId },
    select: {
      id: true,
      regNumber: true,
      fullName: true,
      classLevel: true,
      school: { select: { id: true, name: true, slug: true, logoUrl: true, isActive: true } },
    },
  })

  // The token verified, but the row may have been deleted since it was issued.
  if (!student) throw notFound('Student record not found.')

  const active = await db.examSession.findFirst({
    where: { studentId: session.studentId, status: 'IN_PROGRESS' },
    select: {
      id: true,
      startedAt: true,
      exam: { select: { id: true, title: true, subject: true, durationMins: true, endWindow: true } },
    },
    orderBy: { startedAt: 'desc' },
  })

  return ok({
    student: {
      id: student.id,
      regNumber: student.regNumber,
      fullName: student.fullName,
      // Read live from the database rather than from the token: a promoted student
      // must see their new class level immediately.
      classLevel: student.classLevel,
    },
    school: { id: student.school.id, name: student.school.name, slug: student.school.slug, logoUrl: student.school.logoUrl },
    sessionType: 'student' as const,
    activeSession: active
      ? {
          id: active.id,
          examId: active.exam.id,
          examTitle: active.exam.title,
          subject: active.exam.subject,
          startedAt: active.startedAt,
          secondsRemaining: secondsRemaining(active),
        }
      : null,
  })
})
