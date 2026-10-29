import { SignJWT, jwtVerify } from 'jose'
import { configurationError, forbidden } from '@/lib/errors'

export const SMS_SCHOOL_COOKIE = 'cbt_sms_school'
export const SMS_SCHOOL_TTL = 8 * 60 * 60
const ISSUER = 'cbt-sms-school'
const AUDIENCE = 'cbt-sms'

function key(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw configurationError('JWT_SECRET must contain at least 32 characters.')
  return new TextEncoder().encode(secret)
}

/** A school preference, not an authentication token. A live staff session is still required. */
export async function signSchoolScope(userId: string, schoolId: string): Promise<string> {
  return new SignJWT({ typ: 'sms-school', schoolId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SMS_SCHOOL_TTL}s`)
    .sign(key())
}

export async function verifySchoolScope(token: string, userId: string): Promise<string> {
  const secret = key()
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE,
      requiredClaims: ['sub', 'iat', 'exp', 'typ', 'schoolId'],
    })
    if (payload.typ !== 'sms-school' || payload.sub !== userId ||
        typeof payload.schoolId !== 'string' || !payload.schoolId || payload.schoolId.length > 64) {
      throw new Error('Invalid school context')
    }
    return payload.schoolId
  } catch {
    throw forbidden('Your SMS school selection is invalid or expired. Choose a school again.')
  }
}
