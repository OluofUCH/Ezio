import { existsSync } from 'node:fs'
import { join } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ApiError } from '@/lib/errors'
import { authenticateStudent, loginStudent, logoutStudent, type AuthenticatedStudent } from '@local/auth/student'
import { isConfigured } from '@local/config'
import { db } from '@local/db'
import { createAdminRouter } from '@local/admin'
import { createSetupRouter } from '@local/setup'
import { requireLoopback } from '@local/http/loopback'
import {
  appendFlags,
  heartbeat,
  listExamsForStudent,
  saveAnswer,
  startExam,
  submitExam,
  sweepExpired,
} from '@local/exam/engine'

/**
 * THE LAN HTTP SURFACE
 * ====================
 *
 * Mirrors the cloud's student-facing route shapes and its `{ ok, data }` / `{ ok, error }`
 * envelope, so a client can be pointed at either without conditional logic. That is what
 * makes the eventual browser UI a single codebase rather than two.
 *
 * Two deliberate differences from the cloud:
 *
 *   - Bearer tokens, not cookies. Hall devices are shared machines and a stale cookie on a
 *     shared desktop is how the wrong student ends up in someone else's paper. An explicit
 *     token, held only in the tab, disappears when the tab closes.
 *   - No `schoolSlug` at login. This machine serves one school; asking a student to type it
 *     would be a needless failure mode under exam pressure.
 */

const loginSchema = z
  .object({
    regNumber: z.string().trim().min(1).max(60),
    pin: z.string().trim().regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits.'),
  })
  .strict()

const saveAnswerSchema = z
  .object({
    selectedOptionIds: z
      .array(z.string().min(1).max(64))
      .max(4)
      .transform((ids) => [...new Set(ids)]),
  })
  .strict()

const flagsSchema = z
  .object({
    events: z
      .array(z.object({ type: z.string().trim().min(1).max(40) }).strict())
      .min(1)
      .max(50),
  })
  .strict()

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data })
}

/**
 * Normalise every thrown value into the cloud's failure envelope.
 *
 * `ApiError` is imported from the cloud rather than redefined, so an offline refusal
 * carries the *same* `code` as the online one - `SESSION_ALREADY_CLOSED` means the same
 * thing on both, and a client can branch on it identically.
 */
function fail(res: Response, err: unknown) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message } })
    return
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: err.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
      },
    })
    return
  }
  // Anything else is a bug. Logged in full for the invigilator's console; the student sees
  // nothing internal.
  console.error('[local-server] Unhandled error:', err)
  res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } })
}

/**
 * Wrap an async handler so a rejected promise cannot become a silent hung request.
 *
 * Deliberately does NOT call `next()` after failing: the response has already been sent, and
 * passing control on would reach the 404 handler below and attempt a second write - turning
 * a clean 4xx into an "ERR_HTTP_HEADERS_SENT" crash mid-exam.
 */
function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, _next: NextFunction) => {
    fn(req, res).catch((err: unknown) => {
      fail(res, err)
    })
  }
}

type StudentRequest = Request & { student?: AuthenticatedStudent }

async function requireStudent(req: StudentRequest): Promise<AuthenticatedStudent> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  const student = await authenticateStudent(token)
  if (!student) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in with your registration number and PIN.')
  }
  return student
}

/** Student routes are meaningless until the hall has been paired and staged. */
function requireConfigured(_req: Request, res: Response, next: NextFunction) {
  if (!isConfigured()) {
    res.status(503).json({
      ok: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'This exam hall is not set up yet. Ask the invigilator to complete the setup wizard.',
      },
    })
    return
  }
  next()
}

function webDist(): string | null {
  const candidates = [
    join(process.cwd(), 'dist', 'web'),
    join(process.cwd(), 'local-server', 'dist', 'web'),
  ]
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) return candidate
  }
  return null
}

export function createApp() {
  const app = express()
  app.use(express.json({ limit: '256kb' }))

  // Setup and admin are loopback-only. Their routers also re-check, so a future
  // mount change cannot accidentally expose them to the hall LAN.
  app.use('/api/setup', requireLoopback, createSetupRouter())
  app.use('/api/admin', createAdminRouter())

  /**
   * Health check for the invigilator: confirms the hall can reach this machine and reports
   * what is staged. Unauthenticated on purpose - it is the first thing to try when a
   * student device cannot connect, and it exposes no exam content.
   */
  app.get(
    '/api/health',
    handler(async (_req, res) => {
      const state = await db.syncState.findUnique({ where: { id: 'singleton' } }).catch(() => null)
      const [examCount, studentCount, pending] = await Promise.all([
        db.exam.count().catch(() => 0),
        db.student.count().catch(() => 0),
        db.examSession.count({ where: { syncedAt: null, status: { not: 'IN_PROGRESS' } } }).catch(() => 0),
      ])

      ok(res, {
        status: isConfigured() ? 'ready' : 'setup',
        configured: isConfigured(),
        school: state ? { name: state.schoolName, slug: state.schoolSlug } : null,
        localServer: state ? { id: state.localServerId, name: state.localServerName } : null,
        staged: { exams: examCount, students: studentCount },
        // Surfaced here so an invigilator can confirm at a glance that results are still
        // owed to the cloud before anyone wipes the machine.
        awaitingSync: pending,
        lastPulledAt: state?.lastPulledAt ?? null,
        lastPushedAt: state?.lastPushedAt ?? null,
        serverTime: new Date().toISOString(),
      })
    }),
  )

  app.use('/api/auth/student', requireConfigured)
  app.use('/api/student', requireConfigured)

  app.post(
    '/api/auth/student/login',
    handler(async (req, res) => {
      const input = loginSchema.parse(req.body)
      const result = await loginStudent(input)

      if (!result.ok) {
        // One message for every failure mode - see auth/student.ts.
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect registration number or PIN.')
      }

      ok(res, {
        token: result.token,
        expiresAt: result.expiresAt,
        student: {
          id: result.student.id,
          regNumber: result.student.regNumber,
          fullName: result.student.fullName,
          classLevel: result.student.classLevel,
        },
      })
    }),
  )

  app.post(
    '/api/auth/student/logout',
    handler(async (req, res) => {
      const header = req.headers.authorization
      if (header?.startsWith('Bearer ')) await logoutStudent(header.slice(7).trim())
      ok(res, { loggedOut: true })
    }),
  )

  app.get(
    '/api/student/exams',
    handler(async (req, res) => {
      const student = await requireStudent(req)
      ok(res, { student, exams: await listExamsForStudent(student) })
    }),
  )

  app.post(
    '/api/student/exams/:examId/start',
    handler(async (req, res) => {
      const student = await requireStudent(req)
      const examId = String(req.params.examId)
      ok(res, await startExam(student, examId))
    }),
  )

  app.put(
    '/api/student/sessions/:sessionId/answers/:questionId',
    handler(async (req, res) => {
      const student = await requireStudent(req)
      const input = saveAnswerSchema.parse(req.body)
      ok(
        res,
        await saveAnswer(student, String(req.params.sessionId), String(req.params.questionId), input.selectedOptionIds),
      )
    }),
  )

  app.get(
    '/api/student/sessions/:sessionId',
    handler(async (req, res) => {
      const student = await requireStudent(req)
      ok(res, await heartbeat(student, String(req.params.sessionId)))
    }),
  )

  app.post(
    '/api/student/sessions/:sessionId/flags',
    handler(async (req, res) => {
      const student = await requireStudent(req)
      const input = flagsSchema.parse(req.body)
      ok(res, await appendFlags(student, String(req.params.sessionId), input.events))
    }),
  )

  app.post(
    '/api/student/sessions/:sessionId/submit',
    handler(async (req, res) => {
      const student = await requireStudent(req)
      ok(res, await submitExam(student, String(req.params.sessionId)))
    }),
  )

  /**
   * Legacy invigilator endpoint. Kept for older clients, but restricted to the hall
   * PC now that the admin console is the normal path.
   */
  app.post(
    '/api/invigilator/sweep-expired',
    requireLoopback,
    handler(async (_req, res) => {
      ok(res, await sweepExpired())
    }),
  )

  // Built React UI. API routes above always win; the fallback only handles page paths.
  const dist = webDist()
  if (dist) {
    app.use(express.static(dist))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      res.sendFile(join(dist, 'index.html'))
    })
  }

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'No such endpoint.' } })
  })

  return app
}
