import { randomBytes } from 'node:crypto'
import type { ClassLevel } from '@/lib/core/domain'
import { isClassLevel } from '@/lib/core/domain'
import {
  validateStudentCredentials,
  type StudentLookupDb,
  type ValidatedStudent,
} from '@/lib/auth/student-credentials'
import { serverConfig } from '@local/config'
import { db } from '@local/db'

/**
 * OFFLINE STUDENT LOGIN (PRD §3.4 step 2)
 * =======================================
 *
 * "Student logs in with reg number + PIN — validated against locally cached data."
 *
 * The rule itself is NOT reimplemented here. `validateStudentCredentials` is imported from
 * the cloud and called unchanged; this file only supplies it with a SQLite-backed view of
 * the data. That is precisely what the `StudentLookupDb` interface was built for — its own
 * comment in `lib/auth/student-credentials.ts` says so:
 *
 *   "PRD §3.4 has the offline LocalServer performing exactly the same check against its
 *    local cache with no internet available. M2 satisfies `StudentLookupDb` with its own
 *    client and calls this unchanged — the rule cannot drift between the two modes."
 *
 * So the constant-time PIN comparison, the reg-number normalisation that lets a student
 * type `stu001` for a roster imported as `STU001`, and the refusal to distinguish "no such
 * student" from "wrong PIN" are all inherited rather than rebuilt.
 */

/**
 * Adapt this machine's cache to the shape `validateStudentCredentials` queries.
 *
 * Two deliberate simplifications, both safe because a hall server holds exactly one
 * school's data:
 *
 *   - `isActive: true` is asserted rather than stored. Whether a school is suspended is a
 *     cloud-side billing concern; it is enforced at pull time, and a hall mid-exam must not
 *     start failing logins because of a subscription state it cannot see.
 *   - `Student` has no `schoolId` column — there is only one school here. The adapter checks
 *     the requested id against `SyncState` and reports the cached school's id back, so the
 *     shared function's tenant reasoning still holds.
 */
function cacheAsLookupDb(state: { schoolId: string; schoolSlug: string }): StudentLookupDb {
  return {
    school: {
      async findUnique({ where }) {
        // A slug that isn't this machine's school is "not found" — the same answer the
        // cloud would give, and it keeps the shared function's logic identical.
        if (where.slug !== state.schoolSlug) return null
        return { id: state.schoolId, isActive: true }
      },
    },
    student: {
      async findUnique({ where }) {
        const { schoolId, regNumber } = where.schoolId_regNumber
        if (schoolId !== state.schoolId) return null

        const student = await db.student.findUnique({ where: { regNumber } })
        if (!student) return null

        /**
         * `classLevel` is TEXT on SQLite, so it is validated rather than cast blindly. A
         * value outside the known set means the cache was corrupted or hand-edited, and
         * refusing the login is safer than letting an unrecognised class level flow into
         * the class-matching check.
         */
        if (!isClassLevel(student.classLevel)) return null

        return {
          id: student.id,
          schoolId: state.schoolId,
          regNumber: student.regNumber,
          pin: student.pin,
          fullName: student.fullName,
          classLevel: student.classLevel,
        }
      },
    },
  }
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; student: ValidatedStudent }
  | { ok: false }

/**
 * Authenticate a student and issue a LAN session token.
 *
 * `schoolSlug` is not asked of the student — this machine serves one school, so it comes
 * from `SyncState`. One less thing for a 13-year-old to type correctly under exam pressure.
 *
 * The failure case carries no reason. The shared validator distinguishes "no such reg
 * number" from "wrong PIN" for the server log, and deliberately does not let callers pass
 * that to a client: on a LAN anyone can reach, it would turn the login form into a roster
 * enumerator.
 */
export async function loginStudent(credentials: { regNumber: string; pin: string }): Promise<LoginResult> {
  const state = await db.syncState.findUnique({ where: { id: 'singleton' } })
  if (!state) return { ok: false }

  const result = await validateStudentCredentials(cacheAsLookupDb(state), {
    schoolSlug: state.schoolSlug,
    regNumber: credentials.regNumber,
    pin: credentials.pin,
  })

  if (!result.ok) return { ok: false }

  const { sessionMs } = serverConfig()
  // 32 bytes from the CSPRNG. Opaque and unguessable, so it needs no signature — the
  // token's only job is to name a row in `DeviceSession`.
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionMs)

  await db.deviceSession.create({
    data: { token, studentId: result.student.id, expiresAt },
  })

  return { ok: true, token, expiresAt, student: result.student }
}

export type AuthenticatedStudent = {
  id: string
  regNumber: string
  fullName: string
  classLevel: ClassLevel
}

/**
 * Resolve a bearer token to a student, or null.
 *
 * Expiry is checked in the query rather than after it, so a lapsed token cannot be used
 * even for a moment. Rows are left in place for the sweep below instead of being deleted
 * here — a login endpoint is not the place to do housekeeping mid-exam.
 */
export async function authenticateStudent(token: string | null): Promise<AuthenticatedStudent | null> {
  if (!token) return null

  const session = await db.deviceSession.findFirst({
    where: { token, expiresAt: { gt: new Date() } },
    select: {
      student: { select: { id: true, regNumber: true, fullName: true, classLevel: true } },
    },
  })

  if (!session || !isClassLevel(session.student.classLevel)) return null

  return {
    id: session.student.id,
    regNumber: session.student.regNumber,
    fullName: session.student.fullName,
    classLevel: session.student.classLevel,
  }
}

/** Drop expired login rows. Called at startup so the file does not grow across terms. */
export async function pruneExpiredSessions(): Promise<number> {
  const removed = await db.deviceSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })
  return removed.count
}

export async function logoutStudent(token: string): Promise<void> {
  await db.deviceSession.deleteMany({ where: { token } })
}
