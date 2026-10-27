import { ok, readJson, route } from '@/lib/api'
import { conflict, forbidden } from '@/lib/errors'
import { requireSchoolScope } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'
import { assertAffected, resolveUser } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { updateUserSchema } from '@/lib/validation/user'

export const runtime = 'nodejs'

type Params = { userId: string }

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

/** GET /api/users/[userId] */
export const GET = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const userId = parseParam((await ctx.params).userId, 'userId')

  // findFirst, not findUnique — the tenant extension adds `schoolId`, so a user
  // from another school reads as 404 rather than being returned.
  const user = await db.user.findFirst({ where: { id: userId }, select: USER_SELECT })
  if (!user) throw conflict('User not found.', 'CONFLICT')

  return ok({ user })
})

/**
 * PATCH /api/users/[userId] — update, or deactivate.
 *
 * There is no DELETE. `Exam.createdById` has no `onDelete` rule, so it defaults to
 * Restrict: deleting a teacher who has ever authored an exam would fail at the
 * foreign key, and cascading instead would take their exams and every student's
 * results with them. `isActive: false` is the intended retirement path — and since
 * `requireStaff` re-reads `isActive` on every request, it takes effect immediately
 * rather than at token expiry.
 */
export const PATCH = route<Params>(async (req, ctx) => {
  const { db, session } = await requireSchoolScope(req, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
  const userId = parseParam((await ctx.params).userId, 'userId')
  const input = await readJson(req, updateUserSchema)

  const target = await resolveUser(db, userId)

  // A school admin cannot modify a SUPER_ADMIN who happens to share their school.
  if (target.role === 'SUPER_ADMIN' && session.role !== 'SUPER_ADMIN') {
    throw forbidden('You cannot modify a platform administrator account.', 'ROLE_ESCALATION_BLOCKED')
  }

  // Locking yourself out would leave a school with no usable admin and require
  // platform support to undo.
  if (target.id === session.userId) {
    if (input.isActive === false) throw conflict('You cannot deactivate your own account.')
    if (input.role && input.role !== target.role) throw conflict('You cannot change your own role.')
  }

  // Demoting the last active admin has the same effect as deactivating them.
  const losingAdmin =
    target.role === 'SCHOOL_ADMIN' && (input.isActive === false || (input.role && input.role !== 'SCHOOL_ADMIN'))

  if (losingAdmin) {
    const remaining = await db.user.count({
      where: { role: 'SCHOOL_ADMIN', isActive: true, id: { not: target.id } },
    })
    if (remaining === 0) {
      throw conflict(
        'This is the only active school administrator. Promote another user first, or the school would be left unmanageable.',
      )
    }
  }

  const data: Record<string, unknown> = {}
  if (input.fullName !== undefined) data.fullName = input.fullName
  if (input.role !== undefined) data.role = input.role
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.password !== undefined) data.passwordHash = await hashPassword(input.password)

  // updateMany + assertAffected rather than update: the tenant extension can inject
  // `schoolId` into a filterable where, making "wrong school" indistinguishable
  // from "no such id" — both are count 0, both surface as 404.
  const result = await db.user.updateMany({ where: { id: userId }, data })
  assertAffected(result, 'User not found.')

  const user = await db.user.findFirstOrThrow({ where: { id: userId }, select: USER_SELECT })

  return ok({ user, passwordChanged: input.password !== undefined })
})
