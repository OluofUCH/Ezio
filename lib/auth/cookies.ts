import type { NextRequest, NextResponse } from 'next/server'

/**
 * Session cookie transport.
 *
 * Staff and student sessions use *separate* cookie names so both can be held in
 * one browser at once. A teacher previewing an exam as a test student would
 * otherwise sign themselves out of the admin portal on every switch.
 *
 * `Authorization: Bearer <token>` is accepted as an alternative on every route.
 * That is the path M2's LocalServer uses (PRD §3.4 step 5 — it authenticates
 * machine-to-machine with no cookie jar), and what any future mobile client needs.
 */

export const STAFF_COOKIE = 'cbt_staff'
export const STUDENT_COOKIE = 'cbt_student'

/** Convert a `jose`-style duration ("8h", "45m") to seconds for `Max-Age`. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl)
  if (!match) return 8 * 60 * 60
  const value = Number(match[1])
  const unit = match[2]
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400
  return value * multiplier
}

function baseOptions() {
  return {
    httpOnly: true, // keeps the token out of reach of any injected script
    sameSite: 'lax' as const, // 'strict' would drop the cookie on cross-site portal links
    secure: process.env.NODE_ENV === 'production', // must stay off for http://localhost dev
    path: '/',
  }
}

export function setSessionCookie(res: NextResponse, name: string, token: string, ttl: string): void {
  res.cookies.set({ name, value: token, ...baseOptions(), maxAge: ttlToSeconds(ttl) })
}

export function clearSessionCookie(res: NextResponse, name: string): void {
  // Empty value + Max-Age 0, with the same attributes the cookie was set with —
  // a mismatched path or sameSite leaves the original cookie in place.
  res.cookies.set({ name, value: '', ...baseOptions(), maxAge: 0 })
}

/**
 * Read a token from the Authorization header, falling back to the cookie.
 *
 * Header takes precedence: a programmatic caller that sends an explicit Bearer
 * token should never have it silently overridden by a stale browser cookie.
 */
export function readToken(req: NextRequest, cookieName: string): string | null {
  const header = req.headers.get('authorization')
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim()
    if (token) return token
  }
  return req.cookies.get(cookieName)?.value ?? null
}
