import { cookies } from 'next/headers'
import { unscopedDb } from '@/lib/db'
import { tenantClient, type TenantDb } from '@/lib/tenant'
import { STAFF_COOKIE, STUDENT_COOKIE } from '@/lib/auth/cookies'
import { verifyToken } from '@/lib/auth/jwt'
import type { StaffSession, StudentSession } from '@/lib/auth/session'

/**
 * Session access for React Server Components.
 *
 * The helpers in `lib/auth/session.ts` take a `NextRequest`, which a server component
 * does not have — it reads cookies through `next/headers` instead. Rather than fake a
 * request object, this module re-expresses the same checks over that API, delegating the
 * actual verification to the same `verifyToken` and the same `tenantClient`.
 *
 * Behavioural difference from the route helpers, on purpose: these RETURN NULL instead of
 * throwing. A layout's job when there is no session is to redirect, not to surface a 401 —
 * and an expired token during a page navigation is an ordinary event, not an error worth
 * an error boundary. Routes still throw, because an API caller needs the status code.
 *
 * These are for rendering the shell (a name, a role, a class level). Every mutation and
 * every list still goes through `/api`, where `requireStaff` / `requireStudent` remain
 * the authority — so nothing here widens what a session can reach.
 */

async function readSessionCookie(name: string): Promise<string | null> {
  // `cookies()` is async in Next 15.
  const store = await cookies()
  return store.get(name)?.value ?? null
}

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ */

export type RscStaffContext = {
  session: StaffSession
  db: TenantDb | null
  user: { id: string; email: string; fullName: string; role: StaffSession['role'] }
  school: { id: string; name: string; slug: string } | null
}

/**
 * Resolve the staff session and the account behind it.
 *
 * `isActive` is re-checked here as it is in `requireStaff`: a teacher deactivated
 * mid-shift should stop seeing the portal on their next navigation, not at token expiry.
 *
 * `db` is null for SUPER_ADMIN, who has no school of their own — school-scoped reads
 * require them to name one, exactly as `requireSchoolScope` demands `?schoolId=`.
 */
export async function getStaffContext(): Promise<RscStaffContext | null> {
  const token = await readSessionCookie(STAFF_COOKIE)
  if (!token) return null

  let payload
  try {
    payload = await verifyToken(token)
  } catch {
    return null
  }
  if (payload.typ !== 'staff') return null

  const user = await unscopedDb.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      schoolId: true,
      school: { select: { id: true, name: true, slug: true, isActive: true } },
    },
  })

  if (!user || !user.isActive) return null

  // Trust the database over the token, so a role change or school reassignment takes
  // effect on the next navigation.
  const session: StaffSession = {
    typ: 'staff',
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
  }

  if (user.role !== 'SUPER_ADMIN' && (!user.school || !user.school.isActive)) return null

  return {
    session,
    db: user.schoolId ? tenantClient(user.schoolId) : null,
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    school: user.school ? { id: user.school.id, name: user.school.name, slug: user.school.slug } : null,
  }
}

/* ------------------------------------------------------------------ *
 * Student
 * ------------------------------------------------------------------ */

export type RscStudentContext = {
  session: StudentSession
  db: TenantDb
  student: { id: string; regNumber: string; fullName: string; classLevel: StudentSession['classLevel'] }
  school: { id: string; name: string; slug: string }
}

export async function getStudentContext(): Promise<RscStudentContext | null> {
  const token = await readSessionCookie(STUDENT_COOKIE)
  if (!token) return null

  let payload
  try {
    payload = await verifyToken(token)
  } catch {
    return null
  }
  if (payload.typ !== 'student') return null

  const db = tenantClient(payload.schoolId)

  const student = await db.student.findFirst({
    where: { id: payload.sub },
    select: {
      id: true,
      regNumber: true,
      fullName: true,
      classLevel: true,
      school: { select: { id: true, name: true, slug: true, isActive: true } },
    },
  })

  if (!student || !student.school.isActive) return null

  return {
    session: {
      typ: 'student',
      studentId: student.id,
      schoolId: payload.schoolId,
      // Live from the database — a promoted student sees their new class immediately.
      classLevel: student.classLevel,
    },
    db,
    student: {
      id: student.id,
      regNumber: student.regNumber,
      fullName: student.fullName,
      classLevel: student.classLevel,
    },
    school: { id: student.school.id, name: student.school.name, slug: student.school.slug },
  }
}
