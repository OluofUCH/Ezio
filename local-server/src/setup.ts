import { Router, type Request, type Response as ExpressResponse } from 'express'
import { z } from 'zod'
import {
  APP_VERSION,
  cloudBaseUrl,
  hashInvigilatorPin,
  machineName,
  readHallConfig,
  writeHallConfig,
  type HallConfig,
} from '@local/config'
import { db } from '@local/db'
import { firewallRulePresent, lanAddresses, studentUrl } from '@local/network'
import { cloudRequest } from '@local/cloud/client'
import { pullExam } from '@local/sync/pull'
import { serverConfig } from '@local/config'

const claimSchema = z
  .object({
    setupCode: z.string().trim().min(8).max(40),
    cloudBaseUrl: z.string().trim().url().max(300).optional(),
  })
  .strict()

const pinSchema = z.object({
  pin: z.string().trim().regex(/^\d{6,8}$/, 'Use a 6 to 8 digit invigilator PIN.'),
})

const claimResponseSchema = z.object({
  localServer: z.object({ id: z.string(), name: z.string() }),
  school: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  deviceKey: z.string().min(20),
  serverTime: z.string(),
})

type ClaimResponse = z.infer<typeof claimResponseSchema>

function ok(res: ExpressResponse, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data })
}

function fail(res: ExpressResponse, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    })
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message } })
}

function handler(fn: (req: Request, res: ExpressResponse) => Promise<void>) {
  return (req: Request, res: ExpressResponse) => {
    fn(req, res).catch((error: unknown) => {
      console.error('[setup]', error)
      fail(res, error)
    })
  }
}

async function syncState(): Promise<Awaited<ReturnType<typeof db.syncState.findUnique>> | null> {
  try {
    return await db.syncState.findUnique({ where: { id: 'singleton' } })
  } catch {
    return null
  }
}

async function setupState() {
  const config = readHallConfig()
  const state = await syncState()
  const { port } = serverConfig()

  return {
    configured: Boolean(config?.deviceKey),
    pinSet: Boolean(config?.invigilatorPinHash),
    staged: Boolean(state),
    schoolName: config?.schoolName ?? state?.schoolName ?? null,
    localServerName: config?.localServerName ?? state?.localServerName ?? null,
    cloudBaseUrl: config?.cloudBaseUrl ?? cloudBaseUrl(),
    appVersion: APP_VERSION,
    studentUrl: studentUrl(port),
    addresses: lanAddresses(),
    firewallRulePresent: await firewallRulePresent(),
  }
}

async function claimCloud(baseUrl: string, setupCode: string): Promise<ClaimResponse> {
  let response: globalThis.Response
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/local-servers/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cbt-app-version': APP_VERSION },
      body: JSON.stringify({ setupCode, machineName: machineName(), appVersion: APP_VERSION }),
    })
  } catch (error) {
    throw new Error(
      `Could not reach the cloud at ${baseUrl}. Connect this PC to the internet and check the cloud address. (${
        error instanceof Error ? error.message : String(error)
      })`,
    )
  }

  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: ClaimResponse }
    | { ok: false; error: { code: string; message: string } }
    | null

  if (!response.ok || !body || body.ok !== true) {
    throw new Error(
      body && body.ok === false
        ? body.error.message
        : `The cloud refused the pairing code (HTTP ${response.status}).`,
    )
  }

  return claimResponseSchema.parse(body.data)
}

/**
 * Mounted at `/api/setup`. Every route is loopback-only by the caller (see app.ts).
 */
export function createSetupRouter(): Router {
  const router = Router()
  const { port } = serverConfig()

  router.get(
    '/state',
    handler(async (_req, res) => {
      ok(res, await setupState())
    }),
  )

  router.post(
    '/claim',
    handler(async (req, res) => {
      const input = claimSchema.parse(req.body)
      const config = readHallConfig()
      const baseUrl = (input.cloudBaseUrl || config?.cloudBaseUrl || cloudBaseUrl()).replace(/\/$/, '')
      const claimed = await claimCloud(baseUrl, input.setupCode)

      const next: HallConfig = {
        version: 1,
        cloudBaseUrl: baseUrl,
        deviceKey: claimed.deviceKey,
        localServerId: claimed.localServer.id,
        localServerName: claimed.localServer.name,
        schoolId: claimed.school.id,
        schoolName: claimed.school.name,
        schoolSlug: claimed.school.slug,
        invigilatorPinHash: config?.invigilatorPinHash ?? null,
        autoPush: config?.autoPush ?? false,
        pairedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
      }
      writeHallConfig(next)

      ok(res, {
        school: claimed.school,
        localServer: claimed.localServer,
        serverTime: claimed.serverTime,
        cloudBaseUrl: baseUrl,
      })
    }),
  )

  router.post(
    '/pin',
    handler(async (req, res) => {
      const { pin } = pinSchema.parse(req.body)
      const config = readHallConfig()
      if (!config) throw new Error('Pair this hall before setting the invigilator PIN.')

      writeHallConfig({ ...config, invigilatorPinHash: hashInvigilatorPin(pin) })
      ok(res, { pinSet: true })
    }),
  )

  router.get(
    '/exams',
    handler(async (_req, res) => {
      const data = await cloudRequest<{ exams: unknown[] }>('/api/sync/exams')
      ok(res, data)
    }),
  )

  router.post(
    '/pull',
    handler(async (req, res) => {
      const examId = z.object({ examId: z.string().min(1).max(64) }).parse(req.body).examId
      const result = await pullExam(examId)
      ok(res, result)
    }),
  )

  router.get(
    '/network',
    handler(async (_req, res) => {
      ok(res, {
        addresses: lanAddresses(),
        port,
        studentUrl: studentUrl(port),
        firewallRulePresent: await firewallRulePresent(),
      })
    }),
  )

  return router
}
