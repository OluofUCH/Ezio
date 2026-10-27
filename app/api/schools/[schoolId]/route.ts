import { ok, readJson, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { notFound } from '@/lib/errors'
import { requireSuperAdmin } from '@/lib/auth/session'
import { parseParam } from '@/lib/validation/common'
import { updateSchoolSchema } from '@/lib/validation/school'

export const runtime = 'nodejs'

type Params = { schoolId: string }

const SCHOOL_SELECT = {
  id: true,
  name: true,
  slug: true,
  address: true,
  logoUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true, students: true, exams: true, localServers: true } },
} as const

/** GET /api/schools/[schoolId] */
export const GET = route<Params>(async (req, ctx) => {
  await requireSuperAdmin(req)
  const schoolId = parseParam((await ctx.params).schoolId, 'schoolId')

  const school = await unscopedDb.school.findUnique({ where: { id: schoolId }, select: SCHOOL_SELECT })
  if (!school) throw notFound('School not found.')

  return ok({ school })
})

/**
 * PATCH /api/schools/[schoolId]
 *
 * `isActive: false` suspends a tenant: staff login is refused and student login
 * fails at the `school.isActive` check in `validateStudentCredentials`. It is a
 * reversible switch rather than a delete — `School` cascades to users, students,
 * exams and sessions, so an actual delete would erase a school's entire exam
 * history. No DELETE route exists for that reason.
 */
export const PATCH = route<Params>(async (req, ctx) => {
  await requireSuperAdmin(req)
  const schoolId = parseParam((await ctx.params).schoolId, 'schoolId')
  const input = await readJson(req, updateSchoolSchema)

  const exists = await unscopedDb.school.findUnique({ where: { id: schoolId }, select: { id: true } })
  if (!exists) throw notFound('School not found.')

  const school = await unscopedDb.school.update({
    where: { id: schoolId },
    data: input,
    select: SCHOOL_SELECT,
  })

  return ok({ school })
})
