/**
 * Browser-side API client.
 *
 * Every route in `app/api` answers with the envelope from `lib/api.ts`:
 *
 *   success → { ok: true,  data: T }
 *   failure → { ok: false, error: { code, message, details? } }
 *
 * This unwraps it in one place so no component ever touches `res.ok`, `.json()`, or
 * the envelope itself. A failure becomes a thrown `ApiClientError` carrying the
 * server's own `code` and `message` — the backend writes those for humans
 * (see the messages in `app/api/**`), so they are safe to render directly and
 * far more useful than a generic "something went wrong".
 */

export type ApiFailure = {
  code: string
  message: string
  details?: unknown
}

/** One entry per failed field, as `lib/api.ts` flattens a ZodError. */
export type ValidationDetail = {
  path: string
  code: string
  message: string
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, failure: ApiFailure) {
    super(failure.message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = failure.code
    this.details = failure.details
  }

  /**
   * Field errors keyed by form field name, when the failure was a validation one.
   * Lets a form bind messages to inputs instead of dumping them in a banner.
   */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {}
    const out: Record<string, string> = {}
    for (const entry of this.details as ValidationDetail[]) {
      if (entry && typeof entry.path === 'string' && typeof entry.message === 'string') {
        out[entry.path] ??= entry.message
      }
    }
    return out
  }
}

type RequestOptions = {
  signal?: AbortSignal
  /** Suppress the redirect-on-401 behaviour — used by the session probe itself. */
  allowUnauthenticated?: boolean
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    // Same-origin cookies (`cbt_staff` / `cbt_student`) carry the session.
    credentials: 'same-origin',
    signal: options.signal,
    headers: {},
  }

  if (body instanceof FormData) {
    // Let the browser set the multipart boundary — setting Content-Type by hand
    // omits it and the server's `readUpload` then fails to parse the form.
    init.body = body
  } else if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  const response = await fetch(path, init)

  // 204 has no body to parse.
  if (response.status === 204) return undefined as T

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ApiClientError(response.status, {
      code: 'MALFORMED_RESPONSE',
      message: `The server returned an unreadable response (HTTP ${response.status}).`,
    })
  }

  const envelope = payload as
    | { ok: true; data: T }
    | { ok: false; error: ApiFailure }
    | null

  if (!envelope || typeof envelope !== 'object' || !('ok' in envelope)) {
    throw new ApiClientError(response.status, {
      code: 'MALFORMED_RESPONSE',
      message: 'The server returned an unexpected response shape.',
    })
  }

  if (envelope.ok === false) {
    throw new ApiClientError(response.status, envelope.error)
  }

  return envelope.data
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
}

/** Build a query string, dropping empty/undefined values so `?page=1&search=` never happens. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const serialised = search.toString()
  return serialised ? `?${serialised}` : ''
}

/** Render any thrown value as something worth showing a user. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message
  if (err instanceof DOMException && err.name === 'AbortError') return 'The request was cancelled.'
  if (err instanceof TypeError) {
    // fetch rejects with a TypeError when the network itself is unreachable, which on
    // this platform usually means the LAN server or the internet dropped mid-exam.
    return 'Cannot reach the server. Check your connection and try again.'
  }
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}
