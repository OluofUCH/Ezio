const TOKEN_KEY = 'cbt_hall_student_token'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'

  const token = getToken()
  if (options.auth !== false && token) headers.authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach the hall server. Ask the invigilator to check it is running.')
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string } }
    | null

  if (!payload) throw new ApiError(response.status, 'MALFORMED_RESPONSE', 'The hall server returned an unreadable response.')
  if (payload.ok === false) throw new ApiError(response.status, payload.error.code, payload.error.message)
  return payload.data
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
