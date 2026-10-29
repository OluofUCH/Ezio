import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { conflict } from '@/lib/errors'
import { canManageSchool, canReadStudentPins, requireSchoolScope } from '@/lib/auth/session'
import { generatePin } from '@/lib/auth/pin'
import { forbidden } from '@/lib/errors'
import { pageMeta, paginate } from '@/lib/validation/common'
import { createStudentSchema, listStudentsSchema } from '@/lib/validation/student'
import { createRosterStudents } from '@/src/modules/students/service'

export const runtime = 'nodejs'

/**
 * Students.
 *
 * `pin` is stored in plaintext by design (see schema.prisma) so a school office can
 * re-print a credential. That is contained by role: `canReadStudentPins` admits
 * SCHOOL_ADMIN and SUPER_ADMIN only. A teacher has no reason to read a student's
 * login credential, and the select below is built accordingly rather than filtered
 * after the fact.
 */
function studentSelect(includePin: boolean) {
  return {
    id: true,
    regNumber: true,
    fullName: true,
    classLevel: true,
    createdAt: true,
    ...(includePin ? { pin: true } : {}),
    _count: { select: { examSessions: true } },
  } as const
}

/** GET /api/students — roster for the caller's school, filterable by class level. */
export const GET = route(async (req) => {
  const { db, session } = await requireSchoolScope(req)
  const query = readQuery(req, listStudentsSchema)

  const where = {
    ...(query.classLevel ? { classLevel: query.classLevel } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' as const } },
            { regNumber: { contains: query.search.toUpperCase() } },
          ],
        }
      : {}),
  }

  const [students, total] = await Promise.all([
    db.student.findMany({
      where,
      ...paginate(query),
      // Class then name: how a roster is read on paper.
      orderBy: [{ classLevel: 'asc' }, { fullName: 'asc' }],
      select: studentSelect(canReadStudentPins(session.role)),
    }),
    db.student.count({ where }),
  ])

  return ok({
    students,
    meta: pageMeta(total, query),
    pinsVisible: canReadStudentPins(session.role),
  })
})

/**
 * POST /api/students — add one student.
 *
 * Omitting `pin` generates a CSPRNG one and returns it. Bulk enrolment should use
 * `POST /api/students/import` instead.
 */
export const POST = route(async (req) => {
  const context = await requireSchoolScope(req)
  const { db, session } = context

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school administrator can add students to the roster.')
  }

  const input = await readJson(req, createStudentSchema)

  // Scoped by the tenant client, so this checks for a clash within this school
  // only — @@unique([schoolId, regNumber]) means the same reg number in a
  // different school is perfectly legal.
  const existing = await db.student.findFirst({
    where: { regNumber: input.regNumber },
    select: { id: true, fullName: true },
  })
  if (existing) {
    throw conflict(
      `Registration number ${input.regNumber} is already assigned to ${existing.fullName}.`,
      'ALREADY_EXISTS',
    )
  }

  const pin = input.pin ?? generatePin()

  await createRosterStudents(context, [{ ...input, pin }])
  const student = await db.student.findFirstOrThrow({
    where: { regNumber: input.regNumber },
    select: studentSelect(true),
  })

  // The PIN is returned here regardless of role: whoever creates a student needs to
  // hand them their credential. Subsequent reads are gated by canReadStudentPins.
  return created({ student, pinGenerated: !input.pin })
})
