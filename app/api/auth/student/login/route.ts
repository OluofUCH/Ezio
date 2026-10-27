import { ok, readJson, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { invalidCredentials } from '@/lib/errors'
import { studentLoginSchema } from '@/lib/validation/auth'
import { validateStudentCredentials } from '@/lib/auth/student-credentials'
import { signStudentToken, studentTtl } from '@/lib/auth/jwt'
import { STUDENT_COOKIE, setSessionCookie } from '@/lib/auth/cookies'
import { clearFailures, recordFailure, requireNotThrottled } from '@/lib/auth/throttle'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/http/ip'

export const runtime = 'nodejs'

const IP_POLICY = { limit: 20, windowSeconds: 15 * 60 }
const ACCOUNT_POLICY = { limit: 10, windowSeconds: 15 * 60 }

/**
 * POST /api/auth/student/login - the unified exam login (regNumber + PIN).
 *
 * The credential check itself is delegated to `validateStudentCredentials`, which
 * holds no Next.js or cookie dependencies precisely so M2's LocalServer can call
 * the same function against its local cache with no internet (PRD A3.4 step 2).
 * This route only adds the HTTP concerns: response shape and cookie.
 */
export const POST = route(async (req) => {
  const credentials = await readJson(req, studentLoginSchema)
  const ip = clientIp(req)
  const accountKey = `${credentials.schoolSlug.trim().toLowerCase()}:${credentials.regNumber.trim().toUpperCase()}`

  await requireNotThrottled([
    { scope: 'student-login-ip', key: ip, policy: IP_POLICY },
    { scope: 'student-login-account', key: accountKey, policy: ACCOUNT_POLICY },
  ])

  const result = await validateStudentCredentials(unscopedDb, credentials)

  if (!result.ok) {
    await Promise.all([
      recordFailure('student-login-ip', ip, IP_POLICY),
      recordFailure('student-login-account', accountKey, ACCOUNT_POLICY),
    ])

    // Every failure mode collapses into one message. Distinguishing "no such reg
    // number" from "wrong PIN" would let anyone walk a school's roster; the
    // specific reason is logged server-side for support instead.
    console.warn(
      `[student-login] rejected school="${credentials.schoolSlug}" reg="${credentials.regNumber}" reason=${result.reason}`,
    )
    await audit({
      actorType: 'SYSTEM',
      action: 'STUDENT_LOGIN_FAILED',
      ip,
      metadata: { schoolSlug: credentials.schoolSlug, reason: result.reason },
    })
    throw invalidCredentials('Incorrect registration number or PIN.')
  }

  const student = result.student
  await clearFailures('student-login-account', accountKey)

  const token = await signStudentToken({
    sub: student.id,
    schoolId: student.schoolId,
    classLevel: student.classLevel,
  })

  const school = await unscopedDb.school.findUniqueOrThrow({
    where: { id: student.schoolId },
    select: { id: true, name: true, slug: true, logoUrl: true },
  })

  const response = ok({
    student: {
      id: student.id,
      regNumber: student.regNumber,
      fullName: student.fullName,
      classLevel: student.classLevel,
    },
    school,
    // Lets the frontend distinguish a student session from a staff one when routing.
    sessionType: 'student' as const,
    expiresIn: studentTtl(),
  })

  await audit({
    schoolId: student.schoolId,
    actorUserId: student.id,
    actorType: 'STUDENT',
    action: 'STUDENT_LOGIN_SUCCEEDED',
    ip,
  })

  setSessionCookie(response, STUDENT_COOKIE, token, studentTtl())
  return response
})
