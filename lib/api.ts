import { NextResponse, type NextRequest } from 'next/server'
import { ZodError, type ZodType, type ZodTypeDef } from 'zod'
import {
  ApiError,
  badRequest,
  forbidden,
  internalError,
  payloadTooLarge,
  unsupportedMediaType,
} from '@/lib/errors'
import { log } from '@/lib/log'

/* ------------------------------------------------------------------ *
 * Response envelope
 * ------------------------------------------------------------------ */

export type ApiSuccess<T> = { ok: true; data: T }
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } }

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, { status })
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return ok(data, 201)
}

function fail(error: ApiError, requestId: string): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false as const,
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    },
    {
      status: error.status,
      headers: { 'x-request-id': requestId, ...(error.headers ?? {}) },
    },
  )
}

/**
 * Reject state-changing browser requests whose Origin does not match this host.
 *
 * Requests without an Origin header are allowed because server-to-server callers
 * (the hall server's sync client, smoke tests) do not send one. A browser always
 * sends Origin on a cross-site POST, which is the case this closes: a malicious
 * page silently submitting JSON against a staff cookie.
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin')
  if (!origin) return

  if (origin === 'null') {
    throw forbidden('Cross-site request rejected.')
  }

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (!host) return

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw forbidden('Cross-site request rejected.')
  }

  if (originHost !== host) {
    throw forbidden('Cross-site request rejected.')
  }
}

/* ------------------------------------------------------------------ *
 * Error normalisation
 * ------------------------------------------------------------------ */

/** Prisma error codes we can map to a meaningful client response. */
function fromPrisma(err: { code?: unknown; meta?: unknown }): ApiError | null {
  const code = typeof err.code === 'string' ? err.code : null
  if (!code) return null

  const meta = (err.meta ?? {}) as { target?: unknown; field_name?: unknown }
  const target = Array.isArray(meta.target) ? meta.target.join(', ') : undefined

  switch (code) {
    case 'P2002': // unique constraint violation
      return new ApiError(
        409,
        'ALREADY_EXISTS',
        target
          ? `A record with this ${target} already exists.`
          : 'A record with these details already exists.',
      )
    case 'P2025': // record required but not found
      return new ApiError(404, 'NOT_FOUND', 'Not found.')
    case 'P2003': // foreign key constraint failed
      return new ApiError(
        409,
        'CONFLICT',
        'This record is still referenced by other data and cannot be changed or removed.',
      )
    case 'P2000': // value too long for column
      return new ApiError(400, 'BAD_REQUEST', 'A submitted value is too long for its field.')
    case 'P1001': // cannot reach database
    case 'P1002':
      return new ApiError(500, 'INTERNAL_ERROR', 'Database unavailable.')
    default:
      return null
  }
}

function normalise(err: unknown, requestId: string): ApiError {
  if (err instanceof ApiError) return err

  if (err instanceof ZodError) {
    // Flatten into a stable shape the frontend can bind to form fields.
    // Built from `.issues` directly so this survives Zod major versions.
    const details = err.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      code: issue.code,
      message: issue.message,
    }))
    return new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed.', details)
  }

  if (err && typeof err === 'object') {
    const mapped = fromPrisma(err as { code?: unknown; meta?: unknown })
    if (mapped) return mapped
  }

  // Anything else is a bug. Log it in full server-side; tell the client nothing.
  console.error(`[${requestId}] Unhandled route error:`, err)
  return internalError()
}

/* ------------------------------------------------------------------ *
 * Route wrapper
 * ------------------------------------------------------------------ */

type RouteContext<P> = { params: Promise<P> }
type Handler<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse> | NextResponse

/**
 * Wraps a route handler so every thrown error becomes a uniform JSON failure.
 *
 * Usage:
 *   export const GET = route<{ examId: string }>(async (req, ctx) => {
 *     const { examId } = await ctx.params        // params is a Promise in Next 15+
 *     return ok(...)
 *   })
 */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<NextResponse> => {
    const requestId = crypto.randomUUID()
    const startedAt = Date.now()

    try {
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        assertSameOrigin(req)
      }

      const res = await handler(req, ctx)
      res.headers.set('x-request-id', requestId)
      log('info', 'http_request', {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        status: res.status,
        durationMs: Date.now() - startedAt,
      })
      return res
    } catch (err) {
      const failure = normalise(err, requestId)
      log(failure.status >= 500 ? 'error' : 'warn', 'http_error', {
        requestId,
        method: req.method,
        path: req.nextUrl.pathname,
        status: failure.status,
        code: failure.code,
        durationMs: Date.now() - startedAt,
      })
      return fail(failure, requestId)
    }
  }
}

/* ------------------------------------------------------------------ *
 * Request helpers
 * ------------------------------------------------------------------ */

/**
 * Parse a JSON body and validate it. Rejects non-JSON and oversized payloads.
 *
 * The schema's *input* type is `unknown` rather than `T`. Written as `ZodType<T>` it
 * would default to `ZodType<T, ZodTypeDef, T>` — input identical to output — which no
 * schema using `.default()`, `.transform()` or `.coerce` satisfies, since those exist
 * precisely to make the two differ. `T` then infers from the input side and every
 * defaulted field arrives typed as possibly-undefined. Fixing it here rather than at
 * each call site keeps `T` pinned to the parsed *output*, which is what a handler holds.
 */
export async function readJson<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw unsupportedMediaType('Expected Content-Type: application/json.')
  }

  const declared = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > maxJsonBytes()) {
    throw payloadTooLarge('JSON body exceeds the maximum permitted size.')
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Request body is not valid JSON.', 'MALFORMED_BODY')
  }

  return schema.parse(raw)
}

/**
 * Validate URL search params (pagination, filters) against a schema.
 *
 * Same `unknown` input type as `readJson`, and it matters more here: query schemas are
 * built on `paginationSchema`, which is all defaults and coercion.
 */
export function readQuery<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
}

/**
 * Pull a single uploaded file out of a multipart form.
 *
 * Size is checked against the *actual* buffer length, not the Content-Length
 * header — a header is trivially spoofable, and we're about to hand this to a
 * spreadsheet parser.
 */
export async function readUpload(
  req: NextRequest,
  field: string,
  opts: { allowedExtensions: string[]; maxBytes?: number },
): Promise<{ filename: string; buffer: Buffer }> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw unsupportedMediaType('Expected Content-Type: multipart/form-data.')
  }

  const maxBytes = opts.maxBytes ?? maxUploadBytes()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw badRequest('Could not parse the multipart form body.', 'MALFORMED_BODY')
  }

  const entry = form.get(field)
  if (!entry || typeof entry === 'string') {
    throw badRequest(`Expected a file in form field "${field}".`)
  }

  const filename = entry.name || 'upload'
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  if (!opts.allowedExtensions.includes(extension)) {
    throw unsupportedMediaType(
      `Unsupported file type "${extension || 'unknown'}". Expected one of: ${opts.allowedExtensions.join(', ')}.`,
    )
  }

  const buffer = Buffer.from(await entry.arrayBuffer())
  if (buffer.byteLength === 0) throw badRequest('The uploaded file is empty.')
  if (buffer.byteLength > maxBytes) {
    throw payloadTooLarge(
      `File is ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB; the limit is ${(maxBytes / 1024 / 1024).toFixed(2)} MB.`,
    )
  }

  return { filename, buffer }
}

/* ------------------------------------------------------------------ *
 * Limits
 * ------------------------------------------------------------------ */

export function maxUploadBytes(): number {
  const parsed = Number(process.env.MAX_UPLOAD_BYTES)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 1024 * 1024
}

export function maxImportRows(): number {
  const parsed = Number(process.env.MAX_IMPORT_ROWS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500
}

/** JSON bodies are small except the confirm-import payload, which carries parsed rows. */
function maxJsonBytes(): number {
  return 4 * 1024 * 1024
}
