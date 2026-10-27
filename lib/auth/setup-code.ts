import { createHash, randomInt } from 'node:crypto'

/**
 * Short-lived hall pairing code.
 *
 * This is the one credential a human types on a school PC, so it is short enough
 * to read aloud and long enough to resist guessing: 10 characters from a 32-symbol
 * alphabet is 50 bits. The code is hashed at rest, single-use, and expires quickly;
 * an attacker who obtains a database dump cannot pair a machine with it.
 */
export const SETUP_CODE_TTL_MS = 30 * 60 * 1000

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

function randomCode(): string {
  let raw = ''
  for (let index = 0; index < CODE_LENGTH; index++) {
    raw += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

export function normalizeSetupCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '')
}

export function hashSetupCode(input: string): string {
  return createHash('sha256').update(normalizeSetupCode(input), 'utf8').digest('hex')
}

export type IssuedSetupCode = {
  /** Shown once to the school admin. */
  plaintext: string
  /** Stored on LocalServer.setupCodeHash. */
  hash: string
  expiresAt: Date
}

export function generateSetupCode(now = new Date()): IssuedSetupCode {
  const plaintext = randomCode()
  return {
    plaintext,
    hash: hashSetupCode(plaintext),
    expiresAt: new Date(now.getTime() + SETUP_CODE_TTL_MS),
  }
}
