/**
 * Typed API errors.
 *
 * Every failure that reaches a client goes through `ApiError` so the response
 * envelope is uniform and the status/code pairing can't drift between routes.
 * Anything thrown that is *not* an ApiError is treated as a bug by `lib/api.ts`:
 * logged server-side, reported to the client as a bare 500 with no detail.
 */

export type ApiErrorCode =
  // 400
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'MALFORMED_BODY'
  // 401
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'SESSION_EXPIRED'
  // 403
  | 'FORBIDDEN'
  | 'WRONG_CLASS_LEVEL'
  | 'ROLE_ESCALATION_BLOCKED'
  // 404
  | 'NOT_FOUND'
  // 409
  | 'ALREADY_EXISTS'
  | 'CONFLICT'
  | 'EXAM_HAS_SESSIONS'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'SESSION_ALREADY_CLOSED'
  | 'SESSION_EXPIRED_AUTOSUBMITTED'
  | 'EXAM_NOT_PUBLISHED'
  | 'EXAM_WINDOW_CLOSED'
  | 'EXAM_HAS_NO_QUESTIONS'
  // 413
  | 'PAYLOAD_TOO_LARGE'
  // 429
  | 'RATE_LIMITED'
  // 415
  | 'UNSUPPORTED_MEDIA_TYPE'
  // 422
  | 'IMPORT_VALIDATION_FAILED'
  // 500
  | 'INTERNAL_ERROR'
  | 'CONFIGURATION_ERROR'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly details?: unknown
  readonly headers?: Record<string, string>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: unknown,
    headers?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.headers = headers
  }
}

/* ------------------------------------------------------------------ *
 * Constructors — used instead of `new ApiError(...)` at call sites so
 * status codes stay consistent across ~45 route handlers.
 * ------------------------------------------------------------------ */

export const badRequest = (message = 'Malformed request.', code: ApiErrorCode = 'BAD_REQUEST', details?: unknown) =>
  new ApiError(400, code, message, details)

export const unauthenticated = (message = 'Authentication required.', code: ApiErrorCode = 'UNAUTHENTICATED') =>
  new ApiError(401, code, message)

export const invalidCredentials = (message = 'Invalid credentials.') =>
  new ApiError(401, 'INVALID_CREDENTIALS', message)

export const forbidden = (message = 'You do not have access to this resource.', code: ApiErrorCode = 'FORBIDDEN') =>
  new ApiError(403, code, message)

/**
 * Deliberately also used for records that exist but belong to another school.
 * A 403 would confirm the id is real and leak the neighbouring tenant's key
 * space; a 404 makes "not yours" and "not there" indistinguishable.
 */
export const notFound = (message = 'Not found.') => new ApiError(404, 'NOT_FOUND', message)

export const conflict = (message: string, code: ApiErrorCode = 'CONFLICT', details?: unknown) =>
  new ApiError(409, code, message, details)

export const payloadTooLarge = (message = 'Upload exceeds the maximum permitted size.') =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', message)

export const rateLimited = (message = 'Too many requests. Try again shortly.', retryAfterSeconds = 60) =>
  new ApiError(429, 'RATE_LIMITED', message, { retryAfterSeconds }, {
    'retry-after': String(Math.max(1, Math.ceil(retryAfterSeconds))),
  })

export const unsupportedMediaType = (message: string) => new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message)

export const unprocessable = (message: string, code: ApiErrorCode = 'IMPORT_VALIDATION_FAILED', details?: unknown) =>
  new ApiError(422, code, message, details)

export const internalError = (message = 'Internal server error.') => new ApiError(500, 'INTERNAL_ERROR', message)

export const configurationError = (message: string) => new ApiError(500, 'CONFIGURATION_ERROR', message)
