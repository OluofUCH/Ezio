import { ok, route } from '@/lib/api'
import { forbidden, notFound } from '@/lib/errors'
import { canManageSchool, requireSchoolScope } from '@/lib/auth/session'
import { generateDeviceKey } from '@/lib/auth/device-key'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/http/ip'
import { assertAffected } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { localServerId: string }

/**
 * POST /api/local-servers/[localServerId]/rotate-key - issue a fresh device key.
 *
 * Kept as the manual/CLI fallback now that normal pairing happens through a setup
 * code. Rotation is immediate and total: the previous key stops authenticating on
 * its next use. Any pending setup code is invalidated too, so two credentials can
 * never be waiting on the same hall.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db, session, schoolId } = await requireSchoolScope(req)

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school admin can rotate a device key.')
  }

  const localServerId = parseParam((await ctx.params).localServerId, 'localServerId')

  const existing = await db.localServer.findFirst({
    where: { id: localServerId },
    select: { id: true, name: true, isActive: true, deviceKeyPrefix: true },
  })
  if (!existing) throw notFound('Local server not found.')

  const unsynced = await db.examSession.count({
    where: { localServerId, syncedAt: null },
  })

  const key = generateDeviceKey()

  const rotated = await db.localServer.updateMany({
    where: { id: localServerId },
    data: {
      deviceKey: key.hash,
      deviceKeyPrefix: key.prefix,
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      setupCodeUsedAt: null,
      pairedAt: new Date(),
    },
  })
  assertAffected(rotated, 'Local server not found.')

  await audit({
    schoolId,
    actorUserId: session.userId,
    actorType: 'STAFF',
    action: 'LOCAL_SERVER_KEY_ROTATED',
    targetType: 'LocalServer',
    targetId: localServerId,
    ip: clientIp(req),
  })

  return ok({
    localServer: {
      id: existing.id,
      name: existing.name,
      isActive: existing.isActive,
      deviceKeyPrefix: key.prefix,
      previousKeyPrefix: existing.deviceKeyPrefix,
    },
    deviceKey: {
      value: key.plaintext,
      warning:
        'Copy this now - it is shown only once and cannot be recovered. The previous key stopped working immediately.',
      setup: `Update CLOUD_DEVICE_KEY="${key.plaintext}" in the local server's config, then restart it.`,
    },
    ...(unsynced > 0
      ? {
          caution: `${unsynced} session(s) from this device are not yet reconciled. Reconfigure it with the new key before its next push, or those results will stay on the machine.`,
        }
      : {}),
  })
})
