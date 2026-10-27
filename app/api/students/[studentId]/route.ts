import { ok, readJson, route } from '@/lib/api'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { canManageSchool, canReadStudentPins, requireSchoolScope } from '@/lib/auth/session'
import { assertAffected, resolveStudent } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { updateStudentSchema } from '@/lib/validation/student'

export const runtime = 'nodejs'

type Params = { studentId: string }

function studentSelect(includePin: boolean) {
  return {
    id: true,
    regNumber: true,
    fullName: true,
    classLevel: true,
    createdAt: true,
    ...(includePin ? { pin: true } : {}),
  } as const
}

/** GET /api/students/[studentId] — profile plus attempt history. */
export const GET = route<Params>(async (req, ctx) => {
  const { db, session } = await requireSchoolScope(req)
  const studentId = parseParam((await ctx.params).studentId, 'studentId')

  const student = await db.student.findFirst({
    where: { id: studentId },
    select: {
      ...studentSelect(canReadStudentPins(session.role)),
      examSessions: {
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          startedAt: true,
          submittedAt: true,
          exam: { select: { id: true, title: true, subject: true, classLevel: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 50,
      },
    },
  })
  if (!student) throw notFound('Student not found.')

  return ok({ student, pinsVisible: canReadStudentPins(session.role) })
})

/**
 * PATCH /api/students/[studentId]
 *
 * `regNumber` cannot be changed — it is the login identifier and the unique key.
 */
export const PATCH = route<Params>(async (req, ctx) => {
  const { db, session } = await requireSchoolScope(req)

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school administrator can modify the student roster.')
  }

  const studentId = parseParam((await ctx.params).studentId, 'studentId')
  const input = await readJson(req, updateStudentSchema)

  const student = await resolveStudent(db, studentId)

  /**
   * A class-level change mid-exam would strand the student: `/start` and the resume
   * route both require `student.classLevel === exam.classLevel`, so an open session
   * for the old level becomes unresumable and the attempt is lost. Blocked rather
   * than silently breaking it — the admin can promote them once the exam is in.
   */
  if (input.classLevel && input.classLevel !== student.classLevel) {
    const openSession = await db.examSession.findFirst({
      where: { studentId, status: 'IN_PROGRESS' },
      select: { id: true, exam: { select: { title: true } } },
    })
    if (openSession) {
      throw conflict(
        `This student has an exam in progress ("${openSession.exam.title}"). Changing their class level now would make that session unresumable. Wait for it to be submitted.`,
      )
    }
  }

  const result = await db.student.updateMany({ where: { id: studentId }, data: input })
  assertAffected(result, 'Student not found.')

  const updated = await db.student.findFirstOrThrow({
    where: { id: studentId },
    // Whoever just set a PIN needs to read it back to pass it on.
    select: studentSelect(canReadStudentPins(session.role) || input.pin !== undefined),
  })

  return ok({ student: updated })
})
