import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Student exam PINs.
 *
 * PINs are stored in plaintext by design (see `Student.pin` in schema.prisma) so a
 * school office can re-print a student's credential without a reset-and-redistribute
 * cycle. That decision is contained by two things: PINs are only ever readable by
 * SCHOOL_ADMIN/SUPER_ADMIN, and the comparison below is constant-time.
 */

const PIN_LENGTH = 6

/**
 * Sequences that look random to a generator but are the first thing anyone tries.
 * Regenerating past them costs nothing and removes the worst outcomes.
 */
function isWeak(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true // 000000, 777777
  const digits = pin.split('').map(Number) as number[]
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] as number) + 1)
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] as number) - 1)
  return ascending || descending // 123456, 654321
}

/**
 * Generate a PIN using the CSPRNG. `randomInt` is used rather than `Math.random`
 * because these are login credentials for every student in a school — a predictable
 * PRNG would make one student's PIN enough to derive the rest of an import batch.
 */
export function generatePin(length = PIN_LENGTH): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let pin = ''
    for (let i = 0; i < length; i++) pin += randomInt(0, 10).toString()
    if (!isWeak(pin)) return pin
  }
  // Statistically unreachable; return the last candidate rather than loop forever.
  let fallback = ''
  for (let i = 0; i < length; i++) fallback += randomInt(0, 10).toString()
  return fallback
}

/**
 * Constant-time PIN comparison.
 *
 * Both values are hashed first so the digests are always 32 bytes and
 * `timingSafeEqual` never throws on a length mismatch — comparing the raw strings
 * would either throw (revealing PIN length) or short-circuit on the first
 * differing character, letting an attacker recover a PIN digit by digit.
 */
export function pinsMatch(submitted: string, stored: string): boolean {
  const a = createHash('sha256').update(submitted, 'utf8').digest()
  const b = createHash('sha256').update(stored, 'utf8').digest()
  return timingSafeEqual(a, b)
}
