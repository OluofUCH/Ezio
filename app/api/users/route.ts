import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { conflict } from '@/lib/errors'
import { requireSchoolScope } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'
import { pageMeta, paginate } from '@/lib/validation/common'
import { createUserSchema, listUsersSchema } from '@/lib/validation/user'

export const runtime = 'nodejs'

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { examsCreated: true } },
} as const

/**
 * GET /api/users — staff in the caller's school.
 *
 * `db` is tenant-scoped, so the query carries `schoolId` whether or not it is
 * written here. Teachers may read the staff list (useful for seeing who authored an
 * exam) but not modify it.
 */
export const GET = route(async (req) => {
  const { db } = await requireSchoolScope(req)
  const query = readQuery(req, listUsersSchema)

  const where = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [users, total] = await Promise.all([
    db.user.findMany({ where, ...paginate(query), orderBy: { createdAt: 'desc' }, select: USER_SELECT }),
    db.user.count({ where }),
  ])

  return ok({ users, meta: pageMeta(total, query) })
})

/**
 * POST /api/users — create a teacher or school admin.
 *
 * Two layers stop privilege escalation: `createUserSchema` excludes SUPER_ADMIN
 * from the role enum, and `schoolId` is injected by the tenant client rather than
 * accepted from the body — so a school admin can neither mint a platform owner nor
 * plant a user inside another school.
 */
export const POST = route(async (req) => {
  const { db, schoolId } = await requireSchoolScope(req, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
  const input = await readJson(req, createUserSchema)

  // `User.email` is globally unique, not per-school, so this must be checked
  // against every tenant — one of the few reads that legitimately looks outside
  // the current school. Only existence is revealed, never which school.
  const taken = await unscopedDb.user.findUnique({ where: { email: input.email }, select: { id: true } })
  if (taken) throw conflict(`A user with the email ${input.email} already exists.`, 'ALREADY_EXISTS')

  const passwordHash = await hashPassword(input.password)

  const user = await db.user.create({
    // No schoolId here: the tenant extension injects it. Passing one would be
    // overwritten anyway — see lib/tenant.ts.
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
    } as never,
    select: USER_SELECT,
  })

  return created({ user, schoolId })
})
