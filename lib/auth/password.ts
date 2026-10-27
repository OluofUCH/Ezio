import bcrypt from 'bcryptjs'

/**
 * Staff password hashing.
 *
 * `bcryptjs` rather than `bcrypt`: pure JavaScript, so there is no native module
 * to rebuild for a serverless target. Slower than the native binding, which is
 * irrelevant at login rates and immaterial next to the cost factor itself.
 */

const COST = 12

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST)
}

export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}

/**
 * A bcrypt hash of a throwaway value, used to burn the same CPU time as a real
 * comparison when no user matches the submitted email. Without it, a missing
 * account returns in microseconds while a wrong password takes ~200ms — which
 * turns login into an account-enumeration oracle.
 */
export const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.7Q3lLPYyBoBnP0hCLXK7wCYvVDkQE9K'
