import { APP_VERSION, cloudConfig } from '@local/config'

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export type CloudError = Error & { code?: string; status?: number }

/**
 * Call a cloud endpoint with this hall's device key.
 *
 * The envelope handling lives here so every caller gets the same useful error
 * instead of a bare `HTTP 500`. Nothing is retried automatically: pull/push are
 * explicitly resumable and the operator can see what happened.
 */
export async function cloudRequest<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {},
): Promise<T> {
  const { baseUrl, deviceKey } = cloudConfig()
  const headers = new Headers(init.headers)
  headers.set('x-cbt-app-version', APP_VERSION)
  if (opts.auth !== false) headers.set('authorization', `Bearer ${deviceKey}`)
  if (init.body) headers.set('content-type', 'application/json')

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  } catch (error) {
    const failure = new Error(
      `Could not reach the cloud at ${baseUrl}. Check this machine's internet connection and the cloud address. (${
        error instanceof Error ? error.message : String(error)
      })`,
    ) as CloudError
    failure.code = 'NETWORK'
    throw failure
  }

  const body = (await response.json().catch(() => null)) as Envelope<T> | null

  if (!response.ok || !body || body.ok !== true) {
    const message =
      body && body.ok === false
        ? `${body.error.code}: ${body.error.message}`
        : `The cloud returned HTTP ${response.status}.`
    const failure = new Error(message) as CloudError
    failure.status = response.status
    if (body && body.ok === false) failure.code = body.error.code
    throw failure
  }

  return body.data
}
