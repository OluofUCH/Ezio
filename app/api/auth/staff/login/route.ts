import { ok, readJson, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { forbidden, invalidCredentials } from '@/lib/errors'
import { staffLoginSchema } from '@/lib/validation/auth'
import { DUMMY_HASH, verifyPassword } from '@/lib/auth/password'
import { signStaffToken, staffTtl } from '@/lib/auth/jwt'
import { STAFF_COOKIE, setSessionCookie } from '@/lib/auth/cookies'
import { clearFailures, recordFailure, requireNotThrottled } from '@/lib/auth/throttle'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/http/ip'

// bcryptjs needs the Node runtime; it cannot run on Edge.
export const runtime = 'nodejs'

const IP_POLICY = { limit: 10, windowSeconds: 15 * 60 }
const ACCOUNT_POLICY = { limit: 5, windowSeconds: 15 * 60 }

/**
 * POST /api/auth/staff/login - admin and teacher portal login.
 *
 * One of the three legitimate `unscopedDb` call sites: a user is located by email,
 * so their school is not known until after the lookup. There is no scope to apply yet.
 */
export const POST = route(async (req) => {
  const { email, password } = await readJson(req, staffLoginSchema)
  const ip = clientIp(req)
  const accountKey = email.toLowerCase()

  await requireNotThrottled([
    { scope: 'staff-login-ip', key: ip, policy: IP_POLICY },
    { scope: 'staff-login-account', key: accountKey, policy: ACCOUNT_POLICY },
  ])

  const user = await unscopedDb.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      passwordHash: true,
      schoolId: true,
      school: { select: { id: true, name: true, slug: true, isActive: true } },
    },
  })

  // bcrypt is compared even when no user matched, against a fixed dummy hash. An
  // early return here would answer in microseconds for an unknown email versus
  // ~200ms for a real one, which is enough to enumerate staff accounts.
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)

  if (!user || !passwordMatches) {
    await Promise.all([
      recordFailure('staff-login-ip', ip, IP_POLICY),
      recordFailure('staff-login-account', accountKey, ACCOUNT_POLICY),
    ])
    await audit({
      actorType: 'SYSTEM',
      action: 'STAFF_LOGIN_FAILED',
      ip,
      metadata: { email: accountKey },
    })
    throw invalidCredentials('Incorrect email or password.')
  }

  // Checked only after the password is verified - an anonymous caller learns
  // nothing about which accounts exist or are suspended.
  if (!user.isActive) throw forbidden('This account has been deactivated. Contact your school administrator.')

  if (user.role !== 'SUPER_ADMIN') {
    if (!user.school) throw forbidden('This account is not attached to a school.')
    if (!user.school.isActive) throw forbidden('This school is currently inactive. Contact platform support.')
  }

  await clearFailures('staff-login-account', accountKey)

  const token = await signStaffToken({ sub: user.id, role: user.role, schoolId: user.schoolId })

  const response = ok({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    // The frontend routes on `role`, per the brief's requirement that both flows
    // return enough for correct redirection.
    school: user.school ? { id: user.school.id, name: user.school.name, slug: user.school.slug } : null,
    expiresIn: staffTtl(),
  })

  await audit({
    schoolId: user.schoolId,
    actorUserId: user.id,
    actorType: 'STAFF',
    action: 'STAFF_LOGIN_SUCCEEDED',
    ip,
  })

  setSessionCookie(response, STAFF_COOKIE, token, staffTtl())
  return response
})
