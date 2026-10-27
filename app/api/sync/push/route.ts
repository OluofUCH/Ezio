import { ok, readJson, route } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { requireDevice } from '@/lib/auth/device'
import { reconcilePushedSession } from '@/lib/sync/reconcile'
import type { PushOutcome, SyncPushResult } from '@/lib/sync/payload'
import { pushSyncSchema } from '@/lib/validation/local-server'

export const runtime = 'nodejs'

/**
 * POST /api/sync/push — reconcile a hall server's results into the cloud.
 *
 * PRD §3.4 step 5: "whenever internet returns, the LocalServer pushes all unsynced
 * sessions/answers to the cloud API, authenticated via its deviceKey. Cloud upserts
 * using localServerId + localId to avoid duplicates."
 *
 * The per-session work — tenant checks, class-level re-check, re-grading, idempotency —
 * is in `lib/sync/reconcile.ts`. This route's own job is the batch policy, and it makes
 * one significant choice: **each session commits independently.**
 *
 * Not one transaction around the batch. A hall of forty papers where one carries a stale
 * question id must not lose the other thirty-nine — and a school on a bad connection may
 * only manage a few sessions per attempt before the link drops. Independent commits mean
 * every push makes forward progress that is never rolled back, and the device simply
 * resends whatever it did not get a confirmation for.
 *
 * `touch: true` records this as the device's `lastSyncedAt`. Only push does that: it is
 * the call that actually reconciles results, so the field keeps that meaning rather than
 * degrading into "last contacted".
 */
export const POST = route(async (req) => {
  const { db, session } = await requireDevice(req, { touch: true })
  const input = await readJson(req, pushSyncSchema)

  const now = new Date()
  const results: PushOutcome[] = []

  /**
   * Sequential, not `Promise.all`. Each session opens its own transaction, and firing a
   * couple of hundred of those at once at a pooler configured with `connection_limit=1`
   * would queue or fail rather than finish sooner. Same reasoning as the sweep endpoint.
   */
  for (const pushed of input.sessions) {
    try {
      results.push(await reconcilePushedSession(db, session.localServerId, pushed, now))
    } catch (err) {
      /**
       * Only *expected* rejections are absorbed into a per-session outcome — a stale
       * paper, a cross-tenant id, a class-level mismatch. Anything else (a dropped
       * connection, a constraint we did not anticipate) is rethrown so `lib/api.ts` logs
       * it and returns a 500. Swallowing those would let a device believe a systemic
       * failure was 200 sessions of individually bad data, and mark them all as dealt with.
       */
      if (err instanceof ApiError) {
        results.push({ localId: pushed.localId, outcome: 'REJECTED', reason: err.message })
        continue
      }
      throw err
    }
  }

  const tally = (outcome: PushOutcome['outcome']) => results.filter((r) => r.outcome === outcome).length

  const payload: SyncPushResult = {
    localServer: { id: session.localServerId, name: session.name },
    created: tally('CREATED'),
    updated: tally('UPDATED'),
    alreadySynced: tally('ALREADY_SYNCED'),
    rejected: tally('REJECTED'),
    /**
     * The device keys off this array, not the counts. `CREATED`, `UPDATED` and
     * `ALREADY_SYNCED` all mean "stop holding this locally"; `REJECTED` means keep it and
     * escalate to a human, because retrying will not change the answer.
     */
    results,
    syncedAt: now.toISOString(),
  }

  /**
   * 200 even with rejections in the batch. The request itself succeeded and its body is
   * the authoritative per-session report; a 4xx would tell the device to discard a
   * response that contains the confirmations it needs for the sessions that *did* land.
   */
  return ok(payload)
})
