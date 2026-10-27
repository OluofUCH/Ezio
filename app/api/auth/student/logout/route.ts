import { ok, route } from '@/lib/api'
import { STUDENT_COOKIE, clearSessionCookie } from '@/lib/auth/cookies'

export const runtime = 'nodejs'

/**
 * POST /api/auth/student/logout
 *
 * Clears only the student cookie. A teacher who logged in as a test student keeps
 * their staff session — that separation is the reason the two cookies have
 * different names (see lib/auth/cookies.ts).
 *
 * Note this does NOT submit an in-progress exam. Logging out mid-exam leaves the
 * session IN_PROGRESS and resumable, which is deliberate: a student whose browser
 * crashes should be able to sign back in and continue against the same
 * server-side deadline, not lose the attempt.
 */
export const POST = route(async () => {
  const response = ok({ loggedOut: true })
  clearSessionCookie(response, STUDENT_COOKIE)
  return response
})
