import { unscopedDb } from '@/lib/db'
import { rateLimited } from '@/lib/errors'

export type ThrottlePolicy = {
  /** Failures allowed inside the window before requests are refused. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

export type ThrottleCheck = {
  limited: boolean
  retryAfterSeconds: number
  remaining: number
}

const MAX_STORED_FAILURES = 10_000

function retryAfter(resetAt: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
}

/**
 * Read the current window without mutating it.
 *
 * Called before a credential check so a throttled caller does not even get the
 * timing signal of a password comparison.
 */
export async function checkThrottle(
  scope: string,
  key: string,
  policy: ThrottlePolicy,
): Promise<ThrottleCheck> {
  const row = await unscopedDb.authThrottle.findUnique({
    where: { scope_key: { scope, key } },
    select: { failures: true, resetAt: true },
  })

  if (!row || row.resetAt.getTime() <= Date.now() || row.failures < policy.limit) {
    return { limited: false, retryAfterSeconds: 0, remaining: Math.max(0, policy.limit - (row?.failures ?? 0)) }
  }

  return { limited: true, retryAfterSeconds: retryAfter(row.resetAt), remaining: 0 }
}

/** Throw the uniform 429 when any of the supplied policies is currently exhausted. */
export async function requireNotThrottled(
  entries: Array<{ scope: string; key: string; policy: ThrottlePolicy }>,
): Promise<void> {
  let longest = 0
  for (const entry of entries) {
    const state = await checkThrottle(entry.scope, entry.key, entry.policy)
    if (state.limited) longest = Math.max(longest, state.retryAfterSeconds)
  }

  if (longest > 0) {
    throw rateLimited(
      'Too many failed attempts. Wait a few minutes and try again.',
      longest,
    )
  }
}

/**
 * Record one failed attempt. An expired window starts over rather than carrying
 * yesterday's failures into today.
 */
export async function recordFailure(scope: string, key: string, policy: ThrottlePolicy): Promise<void> {
  const now = new Date()
  const existing = await unscopedDb.authThrottle.findUnique({
    where: { scope_key: { scope, key } },
    select: { id: true, failures: true, resetAt: true },
  })

  if (!existing || existing.resetAt.getTime() <= now.getTime()) {
    const resetAt = new Date(now.getTime() + policy.windowSeconds * 1000)
    await unscopedDb.authThrottle.upsert({
      where: { scope_key: { scope, key } },
      create: { scope, key, failures: 1, windowStartedAt: now, resetAt },
      update: { failures: 1, windowStartedAt: now, resetAt },
    })
    return
  }

  await unscopedDb.authThrottle.update({
    where: { id: existing.id },
    data: { failures: Math.min(MAX_STORED_FAILURES, existing.failures + 1) },
  })
}

/** Forget an account's failures after a successful credential check. */
export async function clearFailures(scope: string, key: string): Promise<void> {
  await unscopedDb.authThrottle.deleteMany({ where: { scope, key } })
}

export async function purgeExpiredThrottles(): Promise<number> {
  const result = await unscopedDb.authThrottle.deleteMany({
    where: { resetAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
  return result.count
}
