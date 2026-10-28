import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Configuration for a hall machine.
 *
 * Development and the command-line tools can still use `.env`, but the installed
 * Windows app stores its identity in `C:\ProgramData\CBT\config.json`. That file is
 * written by the setup wizard after the cloud mints a device key; no human ever
 * edits a 48-character secret.
 */

export const APP_VERSION = '0.1.1'

export type HallConfig = {
  version: 1
  cloudBaseUrl: string
  deviceKey: string
  localServerId: string
  localServerName: string
  schoolId: string
  schoolName: string
  schoolSlug: string
  invigilatorPinHash: string | null
  autoPush: boolean
  pairedAt: string
  appVersion: string
}

export function dataDir(): string {
  return process.env.CBT_DATA_DIR?.trim() || resolve(process.cwd(), 'data')
}

export function configPath(): string {
  return join(dataDir(), 'config.json')
}

export function ensureDataDir(): void {
  mkdirSync(dataDir(), { recursive: true })
}

/** SQLite URL used by the generated client. Absolute so the service's cwd never matters. */
export function databaseUrl(): string {
  const explicit = process.env.LOCAL_DATABASE_URL?.trim()
  if (explicit) return explicit
  return `file:${join(dataDir(), 'exam-hall.db').replace(/\\/g, '/')}`
}

function readJsonConfig(): HallConfig | null {
  try {
    if (!existsSync(configPath())) return null
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8')) as HallConfig
    if (!parsed || parsed.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}

export function readHallConfig(): HallConfig | null {
  return readJsonConfig()
}

export function writeHallConfig(config: HallConfig): void {
  ensureDataDir()
  const target = configPath()
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(temporary, target)
}

export function isConfigured(): boolean {
  const config = readHallConfig()
  return Boolean(config?.deviceKey && config.localServerId)
}

export function cloudBaseUrl(): string {
  return (
    process.env.CLOUD_BASE_URL?.trim().replace(/\/$/, '') ||
    readHallConfig()?.cloudBaseUrl?.replace(/\/$/, '') ||
    'http://localhost:3000'
  )
}

/** Cloud settings. Needed by pairing, pull and push - never during the exam itself. */
export function cloudConfig(): { baseUrl: string; deviceKey: string } {
  const config = readHallConfig()
  const baseUrl = cloudBaseUrl()
  const deviceKey = process.env.CLOUD_DEVICE_KEY?.trim() || config?.deviceKey?.trim() || ''

  if (!deviceKey) {
    throw new Error(
      'This hall is not paired yet. Open http://localhost:4000/setup and enter the code from the school dashboard.',
    )
  }

  return { baseUrl, deviceKey }
}

export function serverConfig(): { port: number; sessionMs: number; adminSessionMs: number } {
  const port = Number(optional('PORT', '4000'))
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a number between 1 and 65535; got "${process.env.PORT}".`)
  }

  const hours = Number(optional('STUDENT_SESSION_HOURS', '6'))
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`STUDENT_SESSION_HOURS must be a positive number; got "${process.env.STUDENT_SESSION_HOURS}".`)
  }

  return {
    port,
    sessionMs: hours * 60 * 60 * 1000,
    adminSessionMs: 8 * 60 * 60 * 1000,
  }
}

export function machineName(): string {
  return process.env.CBT_MACHINE_NAME?.trim() || hostname()
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

/* ------------------------------------------------------------------ *
 * Invigilator PIN
 * ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64

/**
 * Hash the local admin PIN with scrypt. This is not a student PIN: it protects
 * push/backup/re-pair actions, so a fast unsalted digest would be the wrong tool.
 */
export function hashInvigilatorPin(pin: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(pin, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export function verifyInvigilatorPin(pin: string, stored: string | null): boolean {
  if (!stored) return false
  const [scheme, saltRaw, hashRaw] = stored.split('$')
  if (scheme !== 'scrypt' || !saltRaw || !hashRaw) return false

  try {
    const salt = Buffer.from(saltRaw, 'base64url')
    const expected = Buffer.from(hashRaw, 'base64url')
    const actual = scryptSync(pin, salt, expected.length)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
