import { ok, readJson, route } from '@/lib/api'
import { forbidden, notFound } from '@/lib/errors'
import { canManageSchool, canReadStudentPins, requireSchoolScope } from '@/lib/auth/session'
import { parseParam } from '@/lib/validation/common'
import { updateStudentSchema } from '@/lib/validation/student'
import { updateRosterStudent } from '@/src/modules/students/service'

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
  const context = await requireSchoolScope(req)
  const { db, session } = context

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school administrator can modify the student roster.')
  }

  const studentId = parseParam((await ctx.params).studentId, 'studentId')
  const input = await readJson(req, updateStudentSchema)

  // The service retains the open-exam guard and updates placement + class in one transaction.
  await updateRosterStudent(context, studentId, input)

  const updated = await db.student.findFirstOrThrow({
    where: { id: studentId },
    // Whoever just set a PIN needs to read it back to pass it on.
    select: studentSelect(canReadStudentPins(session.role) || input.pin !== undefined),
  })

  return ok({ student: updated })
})
