import { ok, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { requireStaff } from '@/lib/auth/session'

export const runtime = 'nodejs'

/**
 * GET /api/auth/staff/me — rehydrate a session on page load.
 *
 * `requireStaff` has already re-read the account and rejected a deactivated one,
 * so reaching this point means the session is live.
 */
export const GET = route(async (req) => {
  const session = await requireStaff(req)

  const user = await unscopedDb.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
      school: { select: { id: true, name: true, slug: true, logoUrl: true } },
    },
  })

  return ok({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, createdAt: user.createdAt },
    school: user.school,
    permissions: {
      canManageSchools: session.role === 'SUPER_ADMIN',
      canManageStaff: session.role === 'SUPER_ADMIN' || session.role === 'SCHOOL_ADMIN',
      canManageStudents: session.role === 'SUPER_ADMIN' || session.role === 'SCHOOL_ADMIN',
      canReadStudentPins: session.role === 'SUPER_ADMIN' || session.role === 'SCHOOL_ADMIN',
      canManageExams: true,
    },
  })
})
