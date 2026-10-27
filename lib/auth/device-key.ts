import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * LOCAL SERVER DEVICE KEYS
 * ========================
 *
 * The credential a LocalServer presents to the cloud when it syncs (PRD §3.4 step 5,
 * §4.3). Machine-to-machine, so it is a long random string rather than anything a
 * person types — which changes the storage calculus compared with student PINs.
 *
 * PINs are stored in plaintext deliberately (lib/auth/pin.ts) because a school office
 * has to be able to re-read one. A device key is the opposite case: it is written once
 * into a config file on a hall machine and never read by a human again, so there is
 * nothing to gain from keeping it recoverable and a whole tenant's offline results to
 * lose if the database leaks.
 *
 * Stored as a bare SHA-256 digest, not bcrypt. Two reasons:
 *
 *   1. There is no dictionary to slow down. Slow hashing buys time against guessing a
 *      human-chosen secret; against 32 bytes of CSPRNG output the search space is the
 *      defence, and bcrypt would only tax our own sync endpoint.
 *   2. `/api/sync/*` has to *find* the device from the key it presents. A per-row salt
 *      makes lookup-by-key impossible without scanning and bcrypt-comparing every
 *      device in the platform.
 */

/** Prefix so a key found in a config file is identifiable at a glance. */
const KEY_PREFIX = 'cbt_dev_'

/** Bytes of entropy. 32 bytes ≈ 256 bits — far past any brute-force concern. */
const KEY_BYTES = 32

/**
 * Characters of the plaintext kept for display (after the `cbt_dev_` marker).
 *
 * 8 base64url characters is 48 bits, which sounds like a lot to reveal but is not: the
 * remaining ~208 bits still make guessing hopeless. It exists so a School Admin can
 * match a row in the dashboard to the machine in Hall A.
 */
const PREFIX_DISPLAY_CHARS = 8

export type IssuedDeviceKey = {
  /** Returned to the admin exactly once. Never persisted. */
  plaintext: string
  /** What goes in `LocalServer.deviceKey`. */
  hash: string
  /** What goes in `LocalServer.deviceKeyPrefix`, for display only. */
  prefix: string
}

/** Hash a presented key for comparison against the stored digest. */
export function hashDeviceKey(plaintext: string): string {
  return createHash('sha256').update(plaintext.trim(), 'utf8').digest('hex')
}

/**
 * Mint a new device key.
 *
 * `randomBytes` rather than anything seeded — this is the sole credential protecting a
 * school's result upload path, and a predictable generator would let one provisioned
 * key expose the rest.
 */
export function generateDeviceKey(): IssuedDeviceKey {
  const secret = randomBytes(KEY_BYTES).toString('base64url')
  const plaintext = `${KEY_PREFIX}${secret}`

  return {
    plaintext,
    hash: hashDeviceKey(plaintext),
    prefix: `${KEY_PREFIX}${secret.slice(0, PREFIX_DISPLAY_CHARS)}`,
  }
}

/**
 * Constant-time digest comparison.
 *
 * The database lookup in `requireDevice` is already an equality match on an indexed
 * column, so this is not on the hot path — it exists for any future code path that
 * holds a stored digest and needs to compare without leaking position information
 * through early-exit string equality. Both inputs are fixed-length hex digests, so
 * `timingSafeEqual` cannot throw on a length mismatch.
 */
export function deviceKeysMatch(presentedPlaintext: string, storedHash: string): boolean {
  const a = Buffer.from(hashDeviceKey(presentedPlaintext), 'utf8')
  const b = Buffer.from(storedHash, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
