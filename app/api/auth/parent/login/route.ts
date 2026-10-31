import { ok, readJson, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { invalidCredentials } from '@/lib/errors'
import { DUMMY_HASH, verifyPassword } from '@/lib/auth/password'
import { signParentToken, parentTtl } from '@/lib/auth/jwt'
import { PARENT_COOKIE, setSessionCookie } from '@/lib/auth/cookies'
import { clearFailures, recordFailure, requireNotThrottled } from '@/lib/auth/throttle'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/http/ip'
import { parentLoginSchema } from '@/src/modules/parents/validation'

export const runtime = 'nodejs'
const IP_POLICY = { limit: 20, windowSeconds: 15 * 60 }
const ACCOUNT_POLICY = { limit: 5, windowSeconds: 15 * 60 }

export const POST = route(async req => {
  const { schoolSlug, phone, pin } = await readJson(req, parentLoginSchema)
  const ip = clientIp(req), accountKey = `${schoolSlug}:${phone}`
  await requireNotThrottled([
    { scope: 'parent-login-ip', key: ip, policy: IP_POLICY },
    { scope: 'parent-login-account', key: accountKey, policy: ACCOUNT_POLICY },
  ])
  const parent = await unscopedDb.parent.findFirst({ where: { phone, school: { slug: schoolSlug } }, select: {
    id: true, schoolId: true, fullName: true, phone: true, pinHash: true, isActive: true, authVersion: true,
    school: { select: { id: true, name: true, slug: true, isActive: true } },
  } })
  const matches = await verifyPassword(pin, parent?.pinHash ?? DUMMY_HASH)
  if (!parent || !matches || !parent.isActive || !parent.school.isActive) {
    await Promise.all([recordFailure('parent-login-ip', ip, IP_POLICY), recordFailure('parent-login-account', accountKey, ACCOUNT_POLICY)])
    await audit({ actorType: 'SYSTEM', action: 'PARENT_LOGIN_FAILED', ip, metadata: { schoolSlug } })
    throw invalidCredentials('Incorrect school code, phone number or PIN, or parent access is inactive.')
  }
  await clearFailures('parent-login-account', accountKey)
  const token = await signParentToken({ sub: parent.id, schoolId: parent.schoolId, authVersion: parent.authVersion })
  const response = ok({ parent: { id: parent.id, fullName: parent.fullName, phone: parent.phone }, school: { id: parent.school.id, name: parent.school.name, slug: parent.school.slug }, sessionType: 'parent', expiresIn: parentTtl() })
  setSessionCookie(response, PARENT_COOKIE, token, parentTtl())
  await audit({ schoolId: parent.schoolId, actorUserId: parent.id, actorType: 'PARENT', action: 'PARENT_LOGIN_SUCCEEDED', ip })
  return response
})
