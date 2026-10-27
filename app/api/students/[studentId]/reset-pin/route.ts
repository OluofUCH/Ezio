import { ok, route } from '@/lib/api'
import { conflict, forbidden } from '@/lib/errors'
import { canManageSchool, requireSchoolScope } from '@/lib/auth/session'
import { generatePin } from '@/lib/auth/pin'
import { assertAffected, resolveStudent } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { studentId: string }

/**
 * POST /api/students/[studentId]/reset-pin
 *
 * Issues a fresh CSPRNG PIN and returns it once in the response. Separate from
 * PATCH deliberately: "generate a new credential for me to hand over" is a distinct
 * action from editing a record, and keeping it on its own route makes it auditable
 * as one — PRD §6 lists the PIN reset flow as an open question, and this is the
 * admin-only half of it.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db, session } = await requireSchoolScope(req)

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school administrator can reset a student PIN.')
  }

  const studentId = parseParam((await ctx.params).studentId, 'studentId')
  const student = await resolveStudent(db, studentId)

  /**
   * Refused mid-exam. The student is authenticated by a token already issued, so
   * their current sitting would survive — but if they were disconnected and tried to
   * sign back in, the PIN written on their slip would no longer work. Resetting
   * during an exam is almost always a mistake.
   */
  const openSession = await db.examSession.findFirst({
    where: { studentId, status: 'IN_PROGRESS' },
    select: { id: true, exam: { select: { title: true } } },
  })
  if (openSession) {
    throw conflict(
      `${student.fullName} has an exam in progress ("${openSession.exam.title}"). Resetting the PIN now would lock them out if they had to sign in again.`,
    )
  }

  const pin = generatePin()

  const result = await db.student.updateMany({ where: { id: studentId }, data: { pin } })
  assertAffected(result, 'Student not found.')

  return ok({
    student: { id: student.id, regNumber: student.regNumber, fullName: student.fullName },
    // Shown here so it can be written down and handed over.
    pin,
  })
})
