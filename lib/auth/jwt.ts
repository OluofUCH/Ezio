import { SignJWT, jwtVerify } from 'jose'
import type { ClassLevel, UserRole } from '@prisma/client'
import { configurationError, unauthenticated } from '@/lib/errors'

/**
 * Session tokens for both audiences, signed with one secret and told apart by a
 * `typ` discriminant. Using `jose` (rather than `jsonwebtoken`) keeps verification
 * usable from `middleware.ts`, which runs on the Edge runtime where Node crypto
 * bindings are unavailable.
 */

const ISSUER = 'cbt-platform'
const ALGORITHM = 'HS256'

export type StaffTokenPayload = {
  typ: 'staff'
  sub: string
  role: UserRole
  /** null only for SUPER_ADMIN, who sits above every tenant. */
  schoolId: string | null
}

export type StudentTokenPayload = {
  typ: 'student'
  sub: string
  schoolId: string
  /**
   * Carried in the token so exam filtering never reads a class level from the
   * request (PRD §3.2). Still re-read from the database when a session starts,
   * in case the student was promoted while holding a live token.
   */
  classLevel: ClassLevel
}

export type TokenPayload = StaffTokenPayload | StudentTokenPayload

let cachedSecret: Uint8Array | null = null

function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret

  const raw = process.env.JWT_SECRET
  if (!raw || raw.length < 32) {
    // Failing loudly beats signing every session with a weak or empty key.
    throw configurationError(
      'JWT_SECRET is missing or shorter than 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    )
  }

  cachedSecret = new TextEncoder().encode(raw)
  return cachedSecret
}

function ttl(envVar: string, fallback: string): string {
  const value = process.env[envVar]
  return value && /^\d+[smhd]$/.test(value) ? value : fallback
}

export const staffTtl = () => ttl('STAFF_SESSION_TTL', '8h')
export const studentTtl = () => ttl('STUDENT_SESSION_TTL', '6h')

async function sign(claims: Record<string, unknown>, subject: string, expiresIn: string): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret())
}

/**
 * `typ` is omitted from both signatures: each signer stamps its own discriminant in the
 * claims below, so accepting one from the caller would let a staff token be minted
 * through the student path (or the reverse) by passing the wrong literal.
 */
export function signStaffToken(payload: Omit<StaffTokenPayload, 'sub' | 'typ'> & { sub: string }): Promise<string> {
  return sign({ typ: 'staff', role: payload.role, schoolId: payload.schoolId }, payload.sub, staffTtl())
}

export function signStudentToken(
  payload: Omit<StudentTokenPayload, 'sub' | 'typ'> & { sub: string },
): Promise<string> {
  return sign({ typ: 'student', schoolId: payload.schoolId, classLevel: payload.classLevel }, payload.sub, studentTtl())
}

/**
 * Verify a token and narrow it to a known payload shape.
 *
 * `algorithms` is pinned: without it a forged `alg: "none"` header (or an HS/RS
 * confusion) could be accepted. The claim shape is validated after verification
 * too — a valid signature only proves *we* issued the token, not that its body
 * matches what this version of the code expects.
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  let claims: Record<string, unknown>
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALGORITHM], issuer: ISSUER })
    claims = payload as Record<string, unknown>
  } catch (err) {
    const expired = err instanceof Error && err.name === 'JWTExpired'
    throw unauthenticated(
      expired ? 'Your session has expired. Please sign in again.' : 'Invalid session token.',
      expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED',
    )
  }

  const sub = typeof claims.sub === 'string' ? claims.sub : null
  if (!sub) throw unauthenticated('Session token is missing a subject.')

  if (claims.typ === 'staff') {
    const role = claims.role
    if (role !== 'SUPER_ADMIN' && role !== 'SCHOOL_ADMIN' && role !== 'TEACHER') {
      throw unauthenticated('Session token carries an unrecognised role.')
    }
    const schoolId = typeof claims.schoolId === 'string' ? claims.schoolId : null
    // A non-super-admin with no school could not be scoped to anything.
    if (role !== 'SUPER_ADMIN' && !schoolId) {
      throw unauthenticated('Session token is missing a school scope.')
    }
    return { typ: 'staff', sub, role, schoolId }
  }

  if (claims.typ === 'student') {
    const schoolId = typeof claims.schoolId === 'string' ? claims.schoolId : null
    const classLevel = claims.classLevel
    const validLevels = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']
    if (!schoolId || typeof classLevel !== 'string' || !validLevels.includes(classLevel)) {
      throw unauthenticated('Student session token is malformed.')
    }
    return { typ: 'student', sub, schoolId, classLevel: classLevel as ClassLevel }
  }

  throw unauthenticated('Session token has an unrecognised type.')
}
