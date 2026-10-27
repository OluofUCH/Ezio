/**
 * Runtime configuration validation.
 *
 * Fails at server start rather than at the first login or sync call. The checks
 * are deliberately narrow: presence and obvious strength, not a schema for every
 * optional tuning knob.
 */
export function validateEnv(): void {
  const problems: string[] = []

  for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    if (!process.env[name]?.trim()) problems.push(`${name} is not set.`)
  }

  const secret = process.env.JWT_SECRET?.trim() ?? ''
  if (secret.length < 32) {
    problems.push('JWT_SECRET is missing or shorter than 32 characters.')
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.TRUST_PROXY) {
      // Not fatal: a direct deployment without a proxy still works, but every
      // caller shares the "unknown" throttle bucket.
      console.warn('[env] TRUST_PROXY is not set; rate limiting will not distinguish client IPs.')
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`)
  }
}
