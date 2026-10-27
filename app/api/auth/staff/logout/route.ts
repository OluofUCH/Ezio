import { ok, route } from '@/lib/api'
import { STAFF_COOKIE, clearSessionCookie } from '@/lib/auth/cookies'

export const runtime = 'nodejs'

/**
 * POST /api/auth/staff/logout
 *
 * Clears the cookie. Note the M1 limitation: tokens are stateless and there is no
 * blocklist, so a token already copied out of the browser stays valid until it
 * expires. The practical revocation path is deactivating the account
 * (`PATCH /api/users/[userId]` with `isActive: false`), which `requireStaff`
 * re-checks against the database on every request.
 *
 * Unauthenticated on purpose — logging out must work even with an expired or
 * malformed token, which is exactly when a client most needs it to.
 */
export const POST = route(async () => {
  const response = ok({ loggedOut: true })
  clearSessionCookie(response, STAFF_COOKIE)
  return response
})
