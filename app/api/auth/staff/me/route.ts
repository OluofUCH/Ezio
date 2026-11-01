import { ok, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { requireStaff, canReadStudentPins, canManageSchool } from '@/lib/auth/session'
import { tenantClient } from '@/lib/tenant'

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

  const isFormTeacher = session.role === 'TEACHER' && session.schoolId ? Boolean(await tenantClient(session.schoolId).classArm.findFirst({
    where: { formTeacherId: session.userId }, select: { id: true },
  })) : false
  return ok({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, createdAt: user.createdAt },
    school: session.role === 'SUPER_ADMIN' ? null : user.school,
    permissions: {
      canManageSchools: session.role === 'SUPER_ADMIN',
      canManageStaff: canManageSchool(session.role),
      canManageStudents: canManageSchool(session.role),
      canAdmitStudents: canManageSchool(session.role) || isFormTeacher,
      canReadStudentPins: canReadStudentPins(session.role),
      canManageExams: session.role !== 'SUPER_ADMIN',
    },
  })
})
