import { ok, route } from '@/lib/api'
import { forbidden, notFound } from '@/lib/errors'
import { canManageSchool, requireSchoolScope } from '@/lib/auth/session'
import { generateSetupCode } from '@/lib/auth/setup-code'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/http/ip'
import { assertAffected } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { localServerId: string }

/**
 * POST /api/local-servers/[localServerId]/setup-code
 *
 * Issue a fresh pairing code. Works both for a hall that has never been paired and
 * for a replacement machine: the old code, if any, stops working immediately, while
 * the existing device key remains valid until the new machine actually claims.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db, session, schoolId } = await requireSchoolScope(req)

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school admin can issue a pairing code.')
  }

  const localServerId = parseParam((await ctx.params).localServerId, 'localServerId')
  const existing = await db.localServer.findFirst({
    where: { id: localServerId },
    select: { id: true, name: true, pairedAt: true, deviceKeyPrefix: true },
  })
  if (!existing) throw notFound('Local server not found.')

  const setup = generateSetupCode()
  const updated = await db.localServer.updateMany({
    where: { id: localServerId },
    data: {
      setupCodeHash: setup.hash,
      setupCodeExpiresAt: setup.expiresAt,
      setupCodeUsedAt: null,
    },
  })
  assertAffected(updated, 'Local server not found.')

  await audit({
    schoolId,
    actorUserId: session.userId,
    actorType: 'STAFF',
    action: existing.pairedAt ? 'LOCAL_SERVER_REPAIR_CODE_ISSUED' : 'LOCAL_SERVER_SETUP_CODE_ISSUED',
    targetType: 'LocalServer',
    targetId: localServerId,
    ip: clientIp(req),
  })

  return ok({
    localServer: {
      id: existing.id,
      name: existing.name,
      pairedAt: existing.pairedAt?.toISOString() ?? null,
      deviceKeyPrefix: existing.deviceKeyPrefix,
    },
    setupCode: {
      value: setup.plaintext,
      expiresAt: setup.expiresAt.toISOString(),
      warning:
        'Enter this code in the hall app within 30 minutes. It works once and replaces any previous code. The current device key stays valid until the new machine claims.',
    },
  })
})
