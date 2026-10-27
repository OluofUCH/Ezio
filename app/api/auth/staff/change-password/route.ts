import { ok, readJson, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { invalidCredentials } from '@/lib/errors'
import { requireStaff } from '@/lib/auth/session'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { signStaffToken, staffTtl } from '@/lib/auth/jwt'
import { STAFF_COOKIE, setSessionCookie } from '@/lib/auth/cookies'
import { changePasswordSchema } from '@/lib/validation/auth'

// bcryptjs needs the Node runtime; it cannot run on Edge.
export const runtime = 'nodejs'

/**
 * POST /api/auth/staff/change-password — change your own password.
 *
 * Distinct from `PATCH /api/users/[userId]`, which is an *admin* rotating someone
 * else's credential and is authorised by role alone. This one is authorised by
 * knowledge of the existing password, so a borrowed session on an unlocked staffroom
 * machine cannot be used to take an account over.
 *
 * Open to every staff role including SUPER_ADMIN. That is why the lookup goes through
 * `unscopedDb` rather than a tenant client: a platform owner has no school, so there is
 * no scope to apply — and the row being read is fixed to `session.userId` from the
 * verified token, never from the request body, so there is nothing for a caller to
 * point at but their own account.
 */
export const POST = route(async (req) => {
  // Re-reads the account and rejects a deactivated one before anything else.
  const session = await requireStaff(req)
  const { currentPassword, newPassword } = await readJson(req, changePasswordSchema)

  const user = await unscopedDb.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, schoolId: true, passwordHash: true },
  })

  // `requireStaff` already proved the account exists; this is belt-and-braces for the
  // window between that read and this one.
  if (!user) throw invalidCredentials('Your account could not be found.')

  const matches = await verifyPassword(currentPassword, user.passwordHash)
  if (!matches) {
    console.warn(`[change-password] rejected userId="${session.userId}" reason=wrong_current_password`)
    // Deliberately the same 401 shape as a failed login rather than a validation
    // error: the submitted value was a credential, and it was wrong.
    throw invalidCredentials('Your current password is incorrect.')
  }

  const passwordHash = await hashPassword(newPassword)

  await unscopedDb.user.update({
    where: { id: user.id },
    data: { passwordHash },
  })

  /**
   * Re-issue this session's cookie.
   *
   * Sessions are stateless JWTs with no blocklist (see lib/auth/jwt.ts), so a password
   * change CANNOT invalidate tokens already issued to other devices — they stay valid
   * until they expire on their own. Minting a fresh one here at least means the person
   * who just changed their password is not signed out by their own action, and their
   * clock restarts from now. The honest limitation is reported in the response so a UI
   * can say so plainly instead of implying every other device was logged out.
   */
  const token = await signStaffToken({ sub: user.id, role: user.role, schoolId: user.schoolId })

  const response = ok({
    changed: true,
    otherSessionsRevoked: false,
    note: 'Sessions already signed in on other devices stay valid until they expire. Sign out there if you need them ended immediately.',
    expiresIn: staffTtl(),
  })

  setSessionCookie(response, STAFF_COOKIE, token, staffTtl())
  return response
})
