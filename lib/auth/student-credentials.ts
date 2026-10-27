import type { ClassLevel } from '@/lib/core/domain'
import { pinsMatch } from '@/lib/auth/pin'

/**
 * SHARED STUDENT CREDENTIAL VALIDATION
 * ====================================
 *
 * Deliberately free of Next.js, cookie, and JWT imports. This is the single
 * function that decides whether a regNumber+PIN pair is valid, and PRD §3.4 has
 * the offline LocalServer performing exactly the same check against its local
 * cache with no internet available. M2 satisfies `StudentLookupDb` with its own
 * client and calls this unchanged — the rule cannot drift between the two modes,
 * which is the whole point of keeping it here.
 *
 * It resolves the school from a slug itself, so it is one of the few places that
 * legitimately queries outside a tenant scope: the scope does not exist until the
 * student has been identified.
 */

/**
 * The minimum database surface this function needs. Structural, not
 * `PrismaClient`, so a LocalServer backed by SQLite (or any cache with these two
 * lookups) can satisfy it.
 */
export interface StudentLookupDb {
  school: {
    findUnique(args: {
      where: { slug: string }
      select: { id: true; isActive: true }
    }): Promise<{ id: string; isActive: boolean } | null>
  }
  student: {
    findUnique(args: {
      where: { schoolId_regNumber: { schoolId: string; regNumber: string } }
    }): Promise<{
      id: string
      schoolId: string
      regNumber: string
      pin: string
      fullName: string
      classLevel: ClassLevel
    } | null>
  }
}

export type StudentCredentials = {
  schoolSlug: string
  regNumber: string
  pin: string
}

export type ValidatedStudent = {
  id: string
  schoolId: string
  regNumber: string
  fullName: string
  classLevel: ClassLevel
}

/**
 * Granular failure reasons for the server log. Callers must NOT surface these to
 * the client: telling an anonymous caller apart "no such reg number" from "wrong
 * PIN" turns the login form into a roster enumerator.
 */
export type CredentialFailure =
  | 'SCHOOL_NOT_FOUND'
  | 'SCHOOL_INACTIVE'
  | 'STUDENT_NOT_FOUND'
  | 'PIN_MISMATCH'

export type CredentialResult =
  | { ok: true; student: ValidatedStudent }
  | { ok: false; reason: CredentialFailure }

/**
 * Registration numbers are normalised identically on write (create, CSV import)
 * and on read (login), so a student typing `stu001` on a tablet matches a roster
 * imported as `STU001`. The database unique index is on the exact string, so this
 * normalisation is what makes the match reliable — and it is portable, unlike
 * Prisma's `mode: 'insensitive'`, which Postgres supports and SQLite does not.
 * M2 runs on SQLite.
 */
export function normaliseRegNumber(regNumber: string): string {
  return regNumber.trim().toUpperCase().replace(/\s+/g, ' ')
}

export async function validateStudentCredentials(
  db: StudentLookupDb,
  credentials: StudentCredentials,
): Promise<CredentialResult> {
  const schoolSlug = credentials.schoolSlug.trim().toLowerCase()
  const regNumber = normaliseRegNumber(credentials.regNumber)

  const school = await db.school.findUnique({
    where: { slug: schoolSlug },
    select: { id: true, isActive: true },
  })
  if (!school) return { ok: false, reason: 'SCHOOL_NOT_FOUND' }
  if (!school.isActive) return { ok: false, reason: 'SCHOOL_INACTIVE' }

  const student = await db.student.findUnique({
    where: { schoolId_regNumber: { schoolId: school.id, regNumber } },
  })
  if (!student) return { ok: false, reason: 'STUDENT_NOT_FOUND' }

  if (!pinsMatch(credentials.pin, student.pin)) {
    return { ok: false, reason: 'PIN_MISMATCH' }
  }

  // Note the omissions: `pin` never leaves this function.
  return {
    ok: true,
    student: {
      id: student.id,
      schoolId: student.schoolId,
      regNumber: student.regNumber,
      fullName: student.fullName,
      classLevel: student.classLevel,
    },
  }
}
