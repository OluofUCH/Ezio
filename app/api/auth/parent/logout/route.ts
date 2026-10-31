import { ok, route } from '@/lib/api'
import { clearSessionCookie, PARENT_COOKIE } from '@/lib/auth/cookies'

export const POST = route(async () => {
  const response = ok({ signedOut: true })
  clearSessionCookie(response, PARENT_COOKIE)
  return response
})
