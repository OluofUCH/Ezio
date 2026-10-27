import { ok, readJson, route } from '@/lib/api'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { canManageSchool, requireSchoolScope } from '@/lib/auth/session'
import { assertAffected } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { updateLocalServerSchema } from '@/lib/validation/local-server'

export const runtime = 'nodejs'

type Params = { localServerId: string }

const LOCAL_SERVER_SELECT = {
  id: true,
  name: true,
  deviceKeyPrefix: true,
  lastSyncedAt: true,
  lastSeenIp: true,
  isActive: true,
  createdAt: true,
  pairedAt: true,
  appVersion: true,
  _count: { select: { examSessions: true } },
} as const

/** Shared gate: provisioning is the School Admin's remit, not a teacher's (PRD A2). */
async function requireManager(req: Parameters<typeof requireSchoolScope>[0]) {
  const context = await requireSchoolScope(req)
  if (!canManageSchool(context.session.role)) {
    throw forbidden('Only a school admin can manage local servers.')
  }
  return context
}

function withPaired<T extends { pairedAt: Date | null; deviceKeyPrefix: string }>(server: T) {
  return { ...server, isPaired: Boolean(server.pairedAt || server.deviceKeyPrefix) }
}

/** GET /api/local-servers/[localServerId] - one hall's provisioning + sync state. */
export const GET = route<Params>(async (req, ctx) => {
  const { db } = await requireManager(req)
  const localServerId = parseParam((await ctx.params).localServerId, 'localServerId')

  // findFirst, not findUnique: auto-scoped by the tenant extension, so another school's
  // device reads as 404 rather than confirming the id exists.
  const localServer = await db.localServer.findFirst({
    where: { id: localServerId },
    select: LOCAL_SERVER_SELECT,
  })
  if (!localServer) throw notFound('Local server not found.')

  const unsynced = await db.examSession.count({
    where: { localServerId, syncedAt: null },
  })

  return ok({
    localServer: withPaired(localServer),
    sync: {
      lastSyncedAt: localServer.lastSyncedAt,
      totalSessions: localServer._count.examSessions,
      /**
       * Sessions the cloud holds for this device that are still unreconciled. Normally
       * zero - a session only reaches the cloud *through* a push, which stamps
       * `syncedAt`. A non-zero count means results were written by some other path and
       * is worth an admin's attention.
       */
      unsyncedSessions: unsynced,
    },
  })
})

/**
 * PATCH /api/local-servers/[localServerId] - rename, or revoke access.
 *
 * `isActive: false` is the revocation switch. `requireDevice` re-reads it on every sync
 * call, so a stolen or retired machine stops working on its next request - without
 * rotating the key, and without touching the sessions it already pushed.
 */
export const PATCH = route<Params>(async (req, ctx) => {
  const { db } = await requireManager(req)
  const localServerId = parseParam((await ctx.params).localServerId, 'localServerId')

  const input = await readJson(req, updateLocalServerSchema)

  // updateMany + assertAffected: atomic compare-and-set within the tenant scope, which
  // is the pattern lib/tenant.ts prescribes over read-then-write.
  const updated = await db.localServer.updateMany({
    where: { id: localServerId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
  })
  assertAffected(updated, 'Local server not found.')

  const localServer = await db.localServer.findFirst({
    where: { id: localServerId },
    select: LOCAL_SERVER_SELECT,
  })

  return ok({
    localServer: localServer ? withPaired(localServer) : null,
    ...(input.isActive === false
      ? { revoked: 'This device can no longer sync. Its already-synced results are unaffected.' }
      : {}),
  })
})

/**
 * DELETE /api/local-servers/[localServerId] - decommission a hall.
 *
 * Refused while any session references the device. `ExamSession.localServerId` is
 * `onDelete: SetNull`, so deleting would silently strip the offline provenance from
 * every result that came through this machine - the audit trail that says *where* a
 * mark was recorded (PRD A3.4 step 6). Deactivating is almost always what was meant,
 * so the error says so.
 */
export const DELETE = route<Params>(async (req, ctx) => {
  const { db } = await requireManager(req)
  const localServerId = parseParam((await ctx.params).localServerId, 'localServerId')

  const localServer = await db.localServer.findFirst({
    where: { id: localServerId },
    select: { id: true, name: true, _count: { select: { examSessions: true } } },
  })
  if (!localServer) throw notFound('Local server not found.')

  if (localServer._count.examSessions > 0) {
    throw conflict(
      `"${localServer.name}" has ${localServer._count.examSessions} exam session(s) synced through it, so deleting it would erase where those results came from. Deactivate it instead: PATCH with { "isActive": false }.`,
      'CONFLICT',
    )
  }

  const removed = await db.localServer.deleteMany({ where: { id: localServerId } })
  assertAffected(removed, 'Local server not found.')

  return ok({ deleted: true, localServer: { id: localServer.id, name: localServer.name } })
})
