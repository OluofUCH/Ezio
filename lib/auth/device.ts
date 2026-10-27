import type { NextRequest } from 'next/server'
import { unscopedDb } from '@/lib/db'
import { forbidden, unauthenticated } from '@/lib/errors'
import { tenantClient, type TenantDb } from '@/lib/tenant'
import { hashDeviceKey } from '@/lib/auth/device-key'

/**
 * LOCAL SERVER (DEVICE) AUTHENTICATION
 * ====================================
 *
 * The third audience on this API, alongside staff and students. A LocalServer is a
 * machine in an exam hall, so it authenticates with a pre-shared device key over
 * `Authorization: Bearer`, not a cookie - exactly the path `lib/auth/cookies.ts`
 * reserved for it (PRD A3.4 step 5: "authenticated via its `deviceKey`").
 *
 * Deliberately NOT routed through `lib/auth/jwt.ts`. A JWT expires, and a hall server
 * may sit offline for days between provisioning and the push that follows an exam; a
 * credential that quietly lapses mid-term would strand results on the device. The key
 * is long-lived and revoked by flipping `isActive` or rotating it.
 */

export type DeviceSession = {
  typ: 'device'
  localServerId: string
  schoolId: string
  name: string
}

export type ScopedDeviceContext = {
  session: DeviceSession
  schoolId: string
  db: TenantDb
}

/**
 * Read the device key from the Authorization header.
 *
 * Header only - no cookie fallback. A device has no cookie jar, and accepting one here
 * would mean a logged-in browser session could reach the sync endpoints, which are
 * built on the assumption that the caller is a provisioned machine.
 */
function readDeviceKey(req: NextRequest): string | null {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

/**
 * Best-effort client IP for `LocalServer.lastSeenIp`.
 *
 * Advisory only - it is operator diagnostics ("which address is Hall A on today?"), so
 * a spoofable proxy header is acceptable here in a way it never would be for an
 * authorisation decision. Nothing branches on this value.
 */
function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 45)
  }
  return req.headers.get('x-real-ip')?.slice(0, 45) ?? null
}

function reportedVersion(req: NextRequest): string | null {
  const value = req.headers.get('x-cbt-app-version')?.trim()
  return value ? value.slice(0, 40) : null
}

/**
 * Authenticate a LocalServer and return a client scoped to its school.
 *
 * The tenant scope is derived from the device row, so a device key is structurally
 * incapable of reaching another school's data - the same guarantee staff and students
 * get, via the same `tenantClient`.
 *
 * @param opts.touch Record this call as a sync contact. Set for `/push`, where
 *   `lastSyncedAt` genuinely means "results last reconciled"; left off for `/pull` and
 *   for reads, so the field keeps that meaning instead of becoming "last seen".
 */
export async function requireDevice(
  req: NextRequest,
  opts: { touch?: boolean } = {},
): Promise<ScopedDeviceContext> {
  const presented = readDeviceKey(req)
  if (!presented) {
    throw unauthenticated('Device authentication required: send Authorization: Bearer <deviceKey>.')
  }

  /**
   * Look the device up by digest. `unscopedDb` is unavoidable and legitimate here for
   * the same reason as the login lookups in `lib/auth/*` (see lib/db.ts): the school is
   * not known until the caller has been identified, so there is no scope to query
   * within yet. One indexed equality read on a unique column.
   */
  const localServer = await unscopedDb.localServer.findUnique({
    where: { deviceKey: hashDeviceKey(presented) },
    select: {
      id: true,
      name: true,
      schoolId: true,
      isActive: true,
      school: { select: { isActive: true } },
    },
  })

  /**
   * One message for "no such key" and "key belongs to a disabled device". Telling them
   * apart would confirm to anyone probing that a given key is real, which is the whole
   * value of the credential.
   */
  if (!localServer || !localServer.isActive) {
    throw unauthenticated('Invalid or revoked device key.')
  }

  // A distinct, actionable message: the key is fine, the tenant is switched off. Only
  // reachable by a caller already holding a valid key, so it leaks nothing.
  if (!localServer.school.isActive) {
    throw forbidden('This school is currently inactive. Contact platform support.')
  }

  const ip = clientIp(req)
  const appVersion = reportedVersion(req)

  if (opts.touch) {
    await unscopedDb.localServer.update({
      where: { id: localServer.id },
      data: {
        lastSyncedAt: new Date(),
        lastSeenIp: ip,
        ...(appVersion ? { appVersion } : {}),
      },
    })
  } else {
    await unscopedDb.localServer.update({
      where: { id: localServer.id },
      data: {
        ...(ip ? { lastSeenIp: ip } : {}),
        ...(appVersion ? { appVersion } : {}),
      },
    })
  }

  return {
    session: {
      typ: 'device',
      localServerId: localServer.id,
      schoolId: localServer.schoolId,
      name: localServer.name,
    },
    schoolId: localServer.schoolId,
    db: tenantClient(localServer.schoolId),
  }
}
