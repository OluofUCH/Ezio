import type { SyncPushResult } from '@/lib/sync/payload'
import { cloudConfig } from '@local/config'
import { db } from '@local/db'
import { parseSelectedOptionIds } from '@local/exam/storage'

/**
 * PUSH — reconcile this hall's results into the cloud (PRD §3.4 step 5)
 * ====================================================================
 *
 * Run whenever internet returns. Until this succeeds, the sittings on this machine exist
 * nowhere else in the world, which shapes every decision below:
 *
 *   - Nothing is deleted. A pushed session is *marked* `syncedAt`, never removed, so a
 *     failed or half-believed push can always be re-examined. Clearing the machine is a
 *     deliberate operator action after confirming the cloud has everything.
 *   - Batched in chunks, and each chunk's confirmations are recorded before the next is
 *     sent. A school on a failing connection makes real progress per attempt instead of
 *     losing an all-or-nothing upload.
 *   - Safe to re-run at any time. The cloud keys on (localServerId, localId) and answers
 *     `ALREADY_SYNCED` for anything it has, so a duplicate push is a no-op rather than a
 *     duplicate result.
 *
 * Only *closed* sittings are sent. An IN_PROGRESS session is either mid-exam or was
 * abandoned; pushing one would consume an attempt in the cloud for a paper never
 * submitted. Abandoned sessions are closed by `npm run serve`'s sweep or by an operator.
 */

/** Chunk size — small enough that a flaky link still completes one, large enough to be efficient. */
const BATCH_SIZE = 25

export type PushSummary = {
  attempted: number
  created: number
  updated: number
  alreadySynced: number
  rejected: Array<{ localId: string; reason: string }>
}

export async function pushResults(): Promise<PushSummary> {
  const { baseUrl, deviceKey } = cloudConfig()

  const state = await db.syncState.findUnique({ where: { id: 'singleton' } })
  if (!state) {
    throw new Error('This machine has never pulled an exam, so it has nothing to push. Run `npm run pull` first.')
  }

  const pending = await db.examSession.findMany({
    where: { syncedAt: null, status: { not: 'IN_PROGRESS' } },
    orderBy: { submittedAt: 'asc' },
    include: {
      answers: { select: { questionId: true, selectedOptionId: true, selectedOptionIds: true } },
    },
  })

  const summary: PushSummary = {
    attempted: pending.length,
    created: 0,
    updated: 0,
    alreadySynced: 0,
    rejected: [],
  }

  if (pending.length === 0) return summary

  for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
    const batch = pending.slice(offset, offset + BATCH_SIZE)

    const sessions = batch.map((session) => ({
      // The cloud's idempotency key is (localServerId, localId); this row's primary key
      // is that localId.
      localId: session.id,
      examId: session.examId,
      studentId: session.studentId,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      submittedAt: (session.submittedAt ?? session.startedAt).toISOString(),
      securityFlags: parseSecurityFlags(session.securityFlags),
      syncVersion: session.syncVersion,
      /**
       * Selections only. No `score`, no `isCorrect` — the cloud re-grades from these
       * against its own answer key, deliberately (lib/sync/reconcile.ts). The local score
       * exists so a student sees a result immediately; the cloud's is authoritative.
       */
      answers: session.answers.map((answer) => ({
        questionId: answer.questionId,
        selectedOptionIds: parseSelectedOptionIds(answer.selectedOptionIds, answer.selectedOptionId),
      })),
    }))

    const response = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { authorization: `Bearer ${deviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sessions }),
    }).catch((error: unknown) => {
      throw new Error(
        `Could not reach the cloud at ${baseUrl}. Nothing in this batch was marked as synced; re-run when the connection is back. (${
          error instanceof Error ? error.message : String(error)
        })`,
      )
    })

    const body = (await response.json().catch(() => null)) as
      | { ok: true; data: SyncPushResult }
      | { ok: false; error: { code: string; message: string } }
      | null

    if (!response.ok || !body || body.ok !== true) {
      const message =
        body && body.ok === false ? `${body.error.code}: ${body.error.message}` : `HTTP ${response.status}`
      throw new Error(
        `Push refused by the cloud — ${message}. Nothing in this batch was marked as synced; fix the cause and re-run.`,
      )
    }

    /**
     * CREATED, UPDATED and ALREADY_SYNCED all mean the cloud holds this sitting, so all
     * three clear the local flag. Treating ALREADY_SYNCED as anything else would make a
     * device that lost a response retry the same batch forever.
     *
     * REJECTED is left unsynced on purpose. The cloud has given a specific reason (stale
     * paper, class mismatch) that retrying will not change, so the row stays put for a
     * human to look at rather than being quietly marked done.
     */
    for (const result of body.data.results) {
      if (result.outcome === 'REJECTED') {
        summary.rejected.push({ localId: result.localId, reason: result.reason })
        continue
      }

      if (result.outcome === 'CREATED') summary.created++
      else if (result.outcome === 'UPDATED') summary.updated++
      else summary.alreadySynced++

      await db.examSession.update({
        where: { id: result.localId },
        data: { syncedAt: new Date() },
      })
    }
  }

  await db.syncState.update({ where: { id: 'singleton' }, data: { lastPushedAt: new Date() } })

  return summary
}

/** `securityFlags` is JSON-in-TEXT on SQLite; undefined when absent so the field is omitted. */
function parseSecurityFlags(raw: string | null): Array<{ type: string; at: string }> | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return undefined
    const flags = parsed.filter(
      (entry): entry is { type: string; at: string } =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { type?: unknown }).type === 'string' &&
        typeof (entry as { at?: unknown }).at === 'string',
    )
    return flags.length > 0 ? flags : undefined
  } catch {
    // Corrupt telemetry must never block a real result from reaching the cloud.
    return undefined
  }
}
