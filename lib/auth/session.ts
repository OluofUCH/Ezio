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
    select: { isActive: true, role: true, schoolId: true, school: { select: { isActive: true } } },
  })
  if (!user) throw unauthenticated('Your account no longer exists.')
  if (!user.isActive) throw forbidden('Your account has been deactivated.')
  if (user.role !== 'SUPER_ADMIN' && (!user.schoolId || !user.school?.isActive)) {
    throw forbidden('Your school is paused or unavailable.')
  }

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
 * Platform administrators cannot enter a school scope. Query parameters and old
 * school-selection cookies never grant school access.
 */
export async function requireSchoolScope(
  req: NextRequest,
  allowedRoles: UserRole[] = ['SCHOOL_ADMIN', 'TEACHER'],
): Promise<ScopedStaffContext> {
  const session = await requireStaff(req, allowedRoles)

  if (session.role === 'SUPER_ADMIN') {
    throw forbidden('Platform administrators cannot access school operations.')
  }
  const schoolId = session.schoolId
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
 * The token fixes both school and student identity. School status is checked on
 * every request so pausing a school also applies to already signed-in students.
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

  const db = tenantClient(session.schoolId)
  const school = await db.school.findFirst({ select: { isActive: true } })
  if (!school?.isActive) throw forbidden('Your school is paused or unavailable.')
  return { session, db }
}

/* ------------------------------------------------------------------ *
 * Role predicates
 * ------------------------------------------------------------------ */

/** Whether a role may read plaintext student PINs. Teachers may not. */
export function canReadStudentPins(role: UserRole): boolean {
  return role === 'SCHOOL_ADMIN'
}

/** Whether a role may create/modify staff accounts and the student roster. */
export function canManageSchool(role: UserRole): boolean {
  return role === 'SCHOOL_ADMIN'
}
