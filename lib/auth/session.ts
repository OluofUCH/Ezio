import type { NextRequest } from 'next/server'
import type { ClassLevel, UserRole } from '@prisma/client'
import { unscopedDb } from '@/lib/db'
import { forbidden, unauthenticated } from '@/lib/errors'
import { tenantClient, type TenantDb } from '@/lib/tenant'
import { STAFF_COOKIE, STUDENT_COOKIE, readToken } from '@/lib/auth/cookies'
import { verifyToken } from '@/lib/auth/jwt'

export type StaffSession = {
  typ: 'staff'
  userId: string
  role: UserRole
  /** null only for SUPER_ADMIN. */
  schoolId: string | null
}

export type StudentSession = {
  typ: 'student'
  studentId: string
  schoolId: string
  classLevel: ClassLevel
}

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ */

async function readStaffToken(req: NextRequest): Promise<StaffSession | null> {
  const token = readToken(req, STAFF_COOKIE)
  if (!token) return null

  const payload = await verifyToken(token)
  if (payload.typ !== 'staff') return null

  return { typ: 'staff', userId: payload.sub, role: payload.role, schoolId: payload.schoolId }
}

/**
 * Authenticate a staff request and confirm the account is still usable.
 *
 * The `isActive` re-check costs one indexed read per request and is the only
 * revocation this milestone has: tokens are stateless with no blocklist, so
 * without it a teacher deactivated mid-shift would keep full access until their
 * 8-hour token expired. Deactivating a user now takes effect on their next call.
 *
 * @param allowedRoles Omit to accept any authenticated staff role.
 */
export async function requireStaff(req: NextRequest, allowedRoles?: UserRole[]): Promise<StaffSession> {
  const session = await readStaffToken(req)
  if (!session) throw unauthenticated('Staff authentication required.')

  const user = await unscopedDb.user.findUnique({
    where: { id: session.userId },
    select: { isActive: true, role: true, schoolId: true },
  })
  if (!user) throw unauthenticated('Your account no longer exists.')
  if (!user.isActive) throw forbidden('Your account has been deactivated.')

  // Trust the database over the token for role and school. A role change or a
  // school reassignment must take effect immediately, not at token expiry.
  const live: StaffSession = {
    typ: 'staff',
    userId: session.userId,
    role: user.role,
    schoolId: user.schoolId,
  }

  if (allowedRoles && !allowedRoles.includes(live.role)) {
    throw forbidden(`This action requires one of: ${allowedRoles.join(', ')}.`)
  }

  return live
}

export async function requireSuperAdmin(req: NextRequest): Promise<StaffSession> {
  return requireStaff(req, ['SUPER_ADMIN'])
}

/* ------------------------------------------------------------------ *
 * Staff + tenant scope
 * ------------------------------------------------------------------ */

export type ScopedStaffContext = {
  session: StaffSession
  schoolId: string
  db: TenantDb
}

/**
 * Authenticate staff AND produce a Prisma client locked to their school.
 *
 * This is the entry point for every school-scoped staff route. For SCHOOL_ADMIN
 * and TEACHER the `schoolId` comes from their account and is not influenceable by
 * the request in any way.
 *
 * SUPER_ADMIN is the single exception: having no school of their own, they must
 * name one with `?schoolId=`. That is the *only* place in the codebase where a
 * school id is read from a request, and it is safe precisely because the role it
 * is gated behind already has platform-wide access — it selects a scope rather
 * than escaping one.
 */
export async function requireSchoolScope(
  req: NextRequest,
  allowedRoles: UserRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'],
): Promise<ScopedStaffContext> {
  const session = await requireStaff(req, allowedRoles)

  let schoolId = session.schoolId

  if (session.role === 'SUPER_ADMIN') {
    const requested = req.nextUrl.searchParams.get('schoolId')
    if (!requested) {
      throw forbidden(
        'As SUPER_ADMIN you have no school of your own. Add ?schoolId=<id> to target a specific school.',
      )
    }
    const exists = await unscopedDb.school.findUnique({ where: { id: requested }, select: { id: true } })
    if (!exists) throw forbidden('The requested school does not exist.')
    schoolId = requested
  }

  if (!schoolId) throw forbidden('Your account is not attached to a school.')

  return { session, schoolId, db: tenantClient(schoolId) }
}

/* ------------------------------------------------------------------ *
 * Student
 * ------------------------------------------------------------------ */

export type ScopedStudentContext = {
  session: StudentSession
  db: TenantDb
}

/**
 * Authenticate a student request and scope the client to their school.
 *
 * Token-only by design — no `isActive` re-check here, unlike staff. Student
 * requests include autosave traffic from an entire exam hall, and the token
 * already fixes both `schoolId` and `studentId`, so a stale token cannot reach
 * another tenant's data or another student's session. School/roster state is
 * re-verified where it actually matters: at login and at `/start`, which is the
 * gate on beginning a new attempt.
 */
export async function requireStudent(req: NextRequest): Promise<ScopedStudentContext> {
  const token = readToken(req, STUDENT_COOKIE)
  if (!token) throw unauthenticated('Student authentication required.')

  const payload = await verifyToken(token)
  if (payload.typ !== 'student') {
    throw unauthenticated('This endpoint requires a student session.')
  }

  const session: StudentSession = {
    typ: 'student',
    studentId: payload.sub,
    schoolId: payload.schoolId,
    classLevel: payload.classLevel,
  }

  return { session, db: tenantClient(session.schoolId) }
}

/* ------------------------------------------------------------------ *
 * Role predicates
 * ------------------------------------------------------------------ */

/** Whether a role may read plaintext student PINs. Teachers may not. */
export function canReadStudentPins(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN'
}

/** Whether a role may create/modify staff accounts and the student roster. */
export function canManageSchool(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN'
}
