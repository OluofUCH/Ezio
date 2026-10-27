import type { NextRequest } from 'next/server'

/**
 * Best-effort client address for throttling and audit records.
 *
 * `X-Forwarded-For` is only trusted when TRUST_PROXY is explicitly enabled, because
 * otherwise any caller can choose their own throttle bucket. Vercel sets the header
 * at its edge, so production enables it there.
 */
export function clientIp(req: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true'

  if (trustProxy) {
    const forwarded = req.headers.get('x-forwarded-for')
    const first = forwarded?.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)

    const real = req.headers.get('x-real-ip')?.trim()
    if (real) return real.slice(0, 64)
  }

  return 'unknown'
}

export function throttleKey(prefix: string, value: string): string {
  return `${prefix}:${value.trim().toLowerCase()}`
}
