import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response as ExpressResponse } from 'express'
import QRCode from 'qrcode'
import { z } from 'zod'
import {
  APP_VERSION,
  dataDir,
  readHallConfig,
  serverConfig,
  verifyInvigilatorPin,
  writeHallConfig,
} from '@local/config'
import { db } from '@local/db'
import { backupFileName, firewallRulePresent, lanAddresses, studentUrl } from '@local/network'
import { pushResults } from '@local/sync/push'
import { pullExam } from '@local/sync/pull'
import { sweepExpired } from '@local/exam/engine'
import { isLoopback } from '@local/http/loopback'

const ADMIN_COOKIE = 'cbt_hall_admin'
const sessions = new Map<string, number>()
const loginFailures = new Map<string, { count: number; resetAt: number }>()
let pushInFlight = false

function ok(res: ExpressResponse, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data })
}

function fail(res: ExpressResponse, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, error: { code, message } })
}

function parseCookies(req: Request): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return map
}

function requireAdmin(req: Request, res: ExpressResponse, next: NextFunction): void {
  if (!isLoopback(req)) {
    fail(res, 403, 'FORBIDDEN', 'The admin console is available only on the exam-hall computer.')
    return
  }

  const token = parseCookies(req).get(ADMIN_COOKIE)
  const expiresAt = token ? sessions.get(token) : undefined
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    fail(res, 401, 'UNAUTHENTICATED', 'Sign in with the invigilator PIN.')
    return
  }

  next()
}

function adminHandler(fn: (req: Request, res: ExpressResponse) => Promise<void>) {
  return (req: Request, res: ExpressResponse) => {
    fn(req, res).catch((error: unknown) => {
      console.error('[admin]', error)
      fail(res, 400, 'BAD_REQUEST', error instanceof Error ? error.message : String(error))
    })
  }
}

async function statusPayload() {
  const config = readHallConfig()
  const state = await db.syncState.findUnique({ where: { id: 'singleton' } })
  const { port } = serverConfig()

  const [exams, byStatus, pending, inProgress] = await Promise.all([
    db.exam.findMany({
      select: {
        id: true,
        title: true,
        subject: true,
        classLevel: true,
        durationMins: true,
        pulledAt: true,
        _count: { select: { questions: true } },
      },
      orderBy: { pulledAt: 'desc' },
    }),
    db.examSession.groupBy({ by: ['status'], _count: { _all: true } }),
    db.examSession.count({ where: { syncedAt: null, status: { not: 'IN_PROGRESS' } } }),
    db.examSession.count({ where: { status: 'IN_PROGRESS' } }),
  ])

  const url = studentUrl(port)
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 })

  const clockSkewSeconds =
    state?.lastPulledAt && state.cloudTimeAtPull
      ? Math.round((state.lastPulledAt.getTime() - state.cloudTimeAtPull.getTime()) / 1000)
      : null

  return {
    configured: Boolean(config?.deviceKey),
    pinSet: Boolean(config?.invigilatorPinHash),
    school: state
      ? { id: state.schoolId, name: state.schoolName, slug: state.schoolSlug }
      : config
        ? { id: config.schoolId, name: config.schoolName, slug: config.schoolSlug }
        : null,
    localServer: state
      ? { id: state.localServerId, name: state.localServerName }
      : config
        ? { id: config.localServerId, name: config.localServerName }
        : null,
    cloudBaseUrl: config?.cloudBaseUrl ?? null,
    appVersion: APP_VERSION,
    autoPush: config?.autoPush ?? false,
    studentUrl: url,
    addresses: lanAddresses(),
    port,
    qrDataUrl,
    firewallRulePresent: await firewallRulePresent(),
    clockSkewSeconds,
    exams: exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      classLevel: exam.classLevel,
      durationMins: exam.durationMins,
      pulledAt: exam.pulledAt.toISOString(),
      questionCount: exam._count.questions,
    })),
    sessions: {
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      pending,
      inProgress,
    },
    lastPulledAt: state?.lastPulledAt?.toISOString() ?? null,
    lastPushedAt: state?.lastPushedAt?.toISOString() ?? null,
  }
}

/**
 * Mounted at `/api/admin`. All routes are loopback-only, and all but login require
 * an in-memory session cookie. A restart signs the invigilator out, which is the
 * safe default for a shared hall machine.
 */
export function createAdminRouter(): Router {
  const router = Router()
  const { adminSessionMs } = serverConfig()

  router.post(
    '/login',
    (req, res) => {
      if (!isLoopback(req)) {
        fail(res, 403, 'FORBIDDEN', 'The admin console is available only on the exam-hall computer.')
        return
      }

      const now = Date.now()
      const key = req.socket.remoteAddress ?? 'loopback'
      const failure = loginFailures.get(key)
      if (failure && failure.resetAt > now && failure.count >= 5) {
        fail(res, 429, 'RATE_LIMITED', 'Too many PIN attempts. Wait five minutes and try again.')
        return
      }

      const parsed = z.object({ pin: z.string().trim().regex(/^\d{6,8}$/) }).safeParse(req.body)
      if (!parsed.success) {
        fail(res, 400, 'VALIDATION_FAILED', 'Enter the 6 to 8 digit invigilator PIN.')
        return
      }

      const config = readHallConfig()
      if (!config?.invigilatorPinHash) {
        fail(res, 409, 'CONFLICT', 'Set the invigilator PIN in the setup wizard first.')
        return
      }

      if (!verifyInvigilatorPin(parsed.data.pin, config.invigilatorPinHash)) {
        const next = failure && failure.resetAt > now ? failure : { count: 0, resetAt: now + 5 * 60_000 }
        next.count += 1
        loginFailures.set(key, next)
        fail(res, 401, 'INVALID_CREDENTIALS', 'Incorrect invigilator PIN.')
        return
      }

      loginFailures.delete(key)
      const token = randomBytes(32).toString('base64url')
      sessions.set(token, now + adminSessionMs)
      res.setHeader(
        'Set-Cookie',
        `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(adminSessionMs / 1000)}`,
      )
      ok(res, { signedIn: true, expiresInSeconds: Math.floor(adminSessionMs / 1000) })
    },
  )

  router.post('/logout', (req, res) => {
    const token = parseCookies(req).get(ADMIN_COOKIE)
    if (token) sessions.delete(token)
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
    ok(res, { signedOut: true })
  })

  router.get(
    '/status',
    requireAdmin,
    adminHandler(async (_req, res) => {
      ok(res, await statusPayload())
    }),
  )

  router.get(
    '/exams',
    requireAdmin,
    adminHandler(async (_req, res) => {
      const { cloudRequest } = await import('@local/cloud/client')
      const data = await cloudRequest<{ exams: unknown[] }>('/api/sync/exams')
      ok(res, data)
    }),
  )

  router.post(
    '/pull',
    requireAdmin,
    adminHandler(async (req, res) => {
      const examId = z.object({ examId: z.string().min(1).max(64) }).parse(req.body).examId
      ok(res, await pullExam(examId))
    }),
  )

  router.post(
    '/push',
    requireAdmin,
    adminHandler(async (_req, res) => {
      ok(res, await pushNow())
    }),
  )

  router.post(
    '/sweep',
    requireAdmin,
    adminHandler(async (_req, res) => {
      ok(res, await sweepExpired())
    }),
  )

  router.post(
    '/auto-push',
    requireAdmin,
    adminHandler(async (req, res) => {
      const enabled = z.object({ enabled: z.boolean() }).parse(req.body).enabled
      const config = readHallConfig()
      if (!config) throw new Error('Pair this hall first.')
      writeHallConfig({ ...config, autoPush: enabled })
      ok(res, { autoPush: enabled })
    }),
  )

  router.post(
    '/backup',
    requireAdmin,
    adminHandler(async (_req, res) => {
      const directory = join(dataDir(), 'backups')
      mkdirSync(directory, { recursive: true })
      const filename = backupFileName()
      const destination = join(directory, filename)
      // The path is generated here, never supplied by the caller. Escape single
      // quotes anyway because SQLite requires a quoted string for VACUUM INTO.
      await db.$executeRawUnsafe(`VACUUM INTO '${destination.replace(/'/g, "''")}'`)
      const size = statSync(destination).size
      ok(res, { filename, path: destination, sizeBytes: size })
    }),
  )

  router.get(
    '/status/stream',
    requireAdmin,
    adminHandler(async (_req, res) => {
      // Kept as a normal JSON endpoint; the UI polls every 10 seconds.
      ok(res, await statusPayload())
    }),
  )

  return router
}

/** Serialised so a manual button and the background timer cannot push at once. */
export async function pushNow(): Promise<Awaited<ReturnType<typeof pushResults>>> {
  if (pushInFlight) throw new Error('A push is already in progress. Wait for it to finish.')
  pushInFlight = true
  try {
    await sweepExpired()
    return await pushResults()
  } finally {
    pushInFlight = false
  }
}

/**
 * Optional background retry. Only runs when enabled, no exam is in progress, and
 * there are closed sittings waiting. Never uploads an IN_PROGRESS paper.
 */
export function startAutoPush(): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const config = readHallConfig()
      if (!config?.autoPush || !config.deviceKey) return

      const pending = await db.examSession.count({
        where: { syncedAt: null, status: { not: 'IN_PROGRESS' } },
      })
      const inProgress = await db.examSession.count({ where: { status: 'IN_PROGRESS' } })
      if (pending === 0 || inProgress > 0) return

      const result = await pushNow()
      console.log(
        `[auto-push] attempted=${result.attempted} created=${result.created} updated=${result.updated} rejected=${result.rejected.length}`,
      )
    } catch (error) {
      // Offline is the expected state during an exam; retry quietly on the next tick.
      console.warn(`[auto-push] deferred: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, 5 * 60_000)

  timer.unref()
  return timer
}
