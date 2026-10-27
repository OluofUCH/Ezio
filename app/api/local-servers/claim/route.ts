import { ok, readJson, route } from '@/lib/api'
import { badRequest } from '@/lib/errors'
import { unscopedDb } from '@/lib/db'
import { generateDeviceKey } from '@/lib/auth/device-key'
import { hashSetupCode } from '@/lib/auth/setup-code'
import { recordFailure, requireNotThrottled } from '@/lib/auth/throttle'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/http/ip'
import { claimLocalServerSchema } from '@/lib/validation/local-server'

export const runtime = 'nodejs'

const IP_POLICY = { limit: 5, windowSeconds: 15 * 60 }
const CODE_POLICY = { limit: 5, windowSeconds: 15 * 60 }

/**
 * POST /api/local-servers/claim - exchange a one-time setup code for a device key.
 *
 * Public by necessity: the hall app has no account, only the code the school admin
 * just created. The code is short-lived, single-use, hashed at rest, and throttled
 * both by source IP and by the code itself.
 */
export const POST = route(async (req) => {
  const input = await readJson(req, claimLocalServerSchema)
  const ip = clientIp(req)
  const codeHash = hashSetupCode(input.setupCode)

  await requireNotThrottled([
    { scope: 'local-claim-ip', key: ip, policy: IP_POLICY },
    { scope: 'local-claim-code', key: codeHash, policy: CODE_POLICY },
  ])

  const localServer = await unscopedDb.localServer.findUnique({
    where: { setupCodeHash: codeHash },
    select: {
      id: true,
      name: true,
      schoolId: true,
      isActive: true,
      setupCodeExpiresAt: true,
      setupCodeUsedAt: true,
      school: { select: { id: true, name: true, slug: true, isActive: true } },
    },
  })

  const usable =
    localServer &&
    localServer.isActive &&
    localServer.school.isActive &&
    !localServer.setupCodeUsedAt &&
    localServer.setupCodeExpiresAt !== null &&
    localServer.setupCodeExpiresAt.getTime() > Date.now()

  if (!usable) {
    await recordFailure('local-claim-ip', ip, IP_POLICY)
    await recordFailure('local-claim-code', codeHash, CODE_POLICY)
    // One message for expired, already-used, revoked and unknown codes.
    throw badRequest('This pairing code is invalid or has expired. Generate a new code from the dashboard.')
  }

  const key = generateDeviceKey()
  const now = new Date()

  // Compare-and-set guards a race between two machines trying to claim the same code.
  const updated = await unscopedDb.localServer.updateMany({
    where: {
      id: localServer.id,
      setupCodeHash: codeHash,
      setupCodeUsedAt: null,
      isActive: true,
      school: { isActive: true },
    },
    data: {
      deviceKey: key.hash,
      deviceKeyPrefix: key.prefix,
      setupCodeUsedAt: now,
      pairedAt: now,
      appVersion: input.appVersion ?? null,
      lastSeenIp: ip,
    },
  })

  if (updated.count === 0) {
    await recordFailure('local-claim-code', codeHash, CODE_POLICY)
    throw badRequest('This pairing code is invalid or has expired. Generate a new code from the dashboard.')
  }

  await audit({
    schoolId: localServer.schoolId,
    actorType: 'DEVICE',
    action: 'LOCAL_SERVER_PAIRED',
    targetType: 'LocalServer',
    targetId: localServer.id,
    ip,
    metadata: { appVersion: input.appVersion ?? null, machineName: input.machineName ?? null },
  })

  return ok({
    localServer: { id: localServer.id, name: localServer.name },
    school: {
      id: localServer.school.id,
      name: localServer.school.name,
      slug: localServer.school.slug,
    },
    deviceKey: key.plaintext,
    serverTime: now.toISOString(),
  })
})
