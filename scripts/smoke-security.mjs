#!/usr/bin/env node
/**
 * SECURITY SMOKE TEST
 * ===================
 *
 * Exercises the controls that protect the cloud API at its edges: response headers,
 * the protected maintenance endpoint, session-cookie attributes, the one-time hall
 * pairing flow, device-key rotation/revocation, and the login/claim throttles.
 *
 * It is deliberately HTTP-only. It proves the deployed route surface behaves, not
 * that individual helpers are correct (those are covered by unit-level reasoning and
 * the normal smoke tests). Run it against a seeded, non-production database:
 *
 *   1. npm run db:seed
 *   2. npm run dev
 *   3. npm run smoke-security
 *
 * Set CRON_SECRET to exercise the maintenance endpoint; otherwise that check is
 * skipped. Set SMOKE_EXPECT_SECURE=1 when the server runs with NODE_ENV=production
 * to require the Secure cookie attribute.
 */

import { randomInt } from 'node:crypto'

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const ADMIN = {
  email: 'admin@demo-academy.local',
  password: process.env.SEED_DEMO_PASSWORD ?? 'DemoPassword123!',
}
const CRON_SECRET = process.env.CRON_SECRET ?? ''
const EXPECT_SECURE = process.env.SMOKE_EXPECT_SECURE === '1'

let passed = 0
let failed = 0
const failures = []

function check(label, condition, detail) {
  if (condition) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

function errorCode(result) {
  return result.body?.error?.code ?? `HTTP ${result.status}`
}

function randomSetupCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let raw = ''
  for (let index = 0; index < 10; index++) raw += alphabet[randomInt(0, alphabet.length)]
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

/** Minimal client with a cookie jar and access to the response headers. */
function createClient(name) {
  const jar = new Map()

  return {
    name,
    async call(method, path, options = {}) {
      const headers = { ...(options.headers ?? {}) }
      if (options.body !== undefined) headers['content-type'] = 'application/json'
      if (options.bearer) headers.authorization = `Bearer ${options.bearer}`
      if (jar.size > 0) {
        headers.cookie = [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
      }

      let response
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          redirect: 'manual',
        })
      } catch (error) {
        throw new Error(
          `${method} ${path} - could not reach ${BASE_URL}. Is \`npm run dev\` running? (${error.message})`,
        )
      }

      const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
      for (const raw of setCookies) {
        const [pair] = raw.split(';')
        const index = pair.indexOf('=')
        if (index < 1) continue
        const key = pair.slice(0, index).trim()
        const value = pair.slice(index + 1).trim()
        if (value === '' || /max-age=0/i.test(raw)) jar.delete(key)
        else jar.set(key, value)
      }

      const text = await response.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        /* non-JSON body surfaces through `raw` */
      }

      return { status: response.status, body: json, raw: text, headers: response.headers, setCookies }
    },
  }
}

async function main() {
  console.log(`\nCBT security smoke test against ${BASE_URL}`)
  const anon = createClient('anon')

  /* ---------------------------------------------------------------- *
   * Headers and probes
   * ---------------------------------------------------------------- */

  section('Response headers')

  const health = await anon.call('GET', '/api/health')
  check('GET /api/health is 200', health.status === 200, errorCode(health))
  check('Health reports the database is up', health.body?.data?.database === 'up')
  check(
    'Health exposes only status fields',
    JSON.stringify(Object.keys(health.body?.data ?? {}).sort()) ===
      JSON.stringify(['database', 'latencyMs', 'status', 'time']),
    JSON.stringify(Object.keys(health.body?.data ?? {})),
  )
  check('Health is not cacheable', /no-store/i.test(health.headers.get('cache-control') ?? ''))
  check('X-Powered-By is not advertised', health.headers.get('x-powered-by') === null)

  const headerChecks = [
    ['content-security-policy', /default-src 'self'/i],
    ['content-security-policy', /frame-ancestors 'none'/i],
    ['content-security-policy', /object-src 'none'/i],
    ['x-content-type-options', /^nosniff$/i],
    ['x-frame-options', /^DENY$/i],
    ['referrer-policy', /strict-origin-when-cross-origin/i],
    ['permissions-policy', /camera=\(\)/i],
    ['cross-origin-opener-policy', /^same-origin$/i],
    ['strict-transport-security', /max-age=\d+/i],
  ]
  for (const [name, expected] of headerChecks) {
    check(`${name} is set`, expected.test(health.headers.get(name) ?? ''), health.headers.get(name) ?? 'missing')
  }

  const loginPage = await anon.call('GET', '/login')
  check('GET /login is 200', loginPage.status === 200, String(loginPage.status))
  check(
    'HTML responses receive the same CSP',
    /default-src 'self'/i.test(loginPage.headers.get('content-security-policy') ?? ''),
  )

  section('Maintenance endpoint')

  const maintenanceNoAuth = await anon.call('GET', '/api/maintenance')
  check('Maintenance without a secret is 401', maintenanceNoAuth.status === 401, errorCode(maintenanceNoAuth))

  const maintenanceWrong = await anon.call('GET', '/api/maintenance', {
    headers: { authorization: 'Bearer definitely-wrong' },
  })
  check('Maintenance with the wrong secret is 401', maintenanceWrong.status === 401, errorCode(maintenanceWrong))

  if (CRON_SECRET) {
    const maintenanceOk = await anon.call('GET', '/api/maintenance', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
    check('Maintenance with the correct secret is 200', maintenanceOk.status === 200, errorCode(maintenanceOk))
    check('Maintenance reports a purge count', typeof maintenanceOk.body?.data?.throttlesPurged === 'number')
  } else {
    console.log('  SKIP  correct-secret maintenance check (CRON_SECRET is not set)')
  }

  section('Unauthenticated API access')

  const noExams = await anon.call('GET', '/api/exams')
  check('GET /api/exams without a session is 401', noExams.status === 401, errorCode(noExams))
  check('API 401s are JSON, not a login redirect', noExams.headers.get('location') === null)

  const noHalls = await anon.call('GET', '/api/local-servers')
  check('GET /api/local-servers without a session is 401', noHalls.status === 401, errorCode(noHalls))

  const noDevice = await anon.call('GET', '/api/sync/pull?examId=nonexistent123')
  check('Sync pull without a device key is 401', noDevice.status === 401, errorCode(noDevice))

  const badDevice = await anon.call('GET', '/api/sync/exams', { bearer: 'cbt_dev_not-a-real-key' })
  check('Sync exams with an invalid device key is 401', badDevice.status === 401, errorCode(badDevice))

  /* ---------------------------------------------------------------- *
   * Staff session cookie
   * ---------------------------------------------------------------- */

  section('Staff session')

  const staff = createClient('admin')
  const staffLogin = await staff.call('POST', '/api/auth/staff/login', { body: ADMIN })
  check('School admin can log in', staffLogin.status === 200, errorCode(staffLogin))
  check(
    'Login response does not leak a token',
    !/token/i.test(JSON.stringify(staffLogin.body ?? {})),
  )

  const staffCookie = staffLogin.setCookies.find((raw) => raw.startsWith('cbt_staff='))
  check('Login sets the cbt_staff cookie', Boolean(staffCookie))
  check('Session cookie is HttpOnly', /;\s*httponly/i.test(staffCookie ?? ''))
  check('Session cookie is SameSite=Lax', /;\s*samesite=lax/i.test(staffCookie ?? ''))
  check('Session cookie is scoped to /', /;\s*path=\//i.test(staffCookie ?? ''))
  check('Session cookie has Max-Age', /;\s*max-age=\d+/i.test(staffCookie ?? ''))
  if (EXPECT_SECURE) check('Session cookie is Secure in production', /;\s*secure/i.test(staffCookie ?? ''))

  /* ---------------------------------------------------------------- *
   * Self-service pairing
   * ---------------------------------------------------------------- */

  section('Hall pairing')

  const created = await staff.call('POST', '/api/local-servers', {
    body: { name: `Security smoke ${Date.now()}` },
  })
  check('School admin can provision a hall', created.status === 201, errorCode(created))

  const serverId = created.body?.data?.localServer?.id
  const setupCode = created.body?.data?.setupCode?.value
  check('Provisioning returns a setup code once', typeof setupCode === 'string' && setupCode.length === 11)
  check('Setup code uses the expected format', /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(setupCode ?? ''))
  check('Provisioned hall is not yet paired', created.body?.data?.localServer?.isPaired === false)
  check('Provisioning does not return a device key', !JSON.stringify(created.body ?? {}).includes('cbt_dev_'))

  const list = await staff.call('GET', '/api/local-servers?pageSize=100')
  check('Hall list is readable by the admin', list.status === 200, errorCode(list))
  const listText = JSON.stringify(list.body ?? {})
  check('Hall list does not repeat the setup code', !listText.includes(setupCode ?? '___'))
  check('Hall list does not expose device key material', !/"deviceKey"|"setupCodeHash"/.test(listText))

  const detail = await staff.call('GET', `/api/local-servers/${serverId}`)
  check('Hall detail is readable by the admin', detail.status === 200, errorCode(detail))
  check(
    'Hall detail does not expose credentials',
    !JSON.stringify(detail.body ?? {}).includes(setupCode ?? '___') &&
      !/"deviceKey"|"setupCodeHash"/.test(JSON.stringify(detail.body ?? {})),
  )

  const invalidClaim = await anon.call('POST', '/api/local-servers/claim', {
    body: { setupCode: 'ZZZZZ-ZZZZZ', machineName: 'security-smoke' },
  })
  check('An unknown setup code is refused', invalidClaim.status === 400, errorCode(invalidClaim))
  check(
    'The refusal does not distinguish unknown from expired/used codes',
    /invalid or has expired/i.test(invalidClaim.body?.error?.message ?? ''),
  )

  const claim = await anon.call('POST', '/api/local-servers/claim', {
    body: { setupCode, machineName: 'security-smoke', appVersion: '0.1.0' },
  })
  check('A valid setup code can be claimed', claim.status === 200, errorCode(claim))
  const deviceKey = claim.body?.data?.deviceKey
  check('Claiming mints a device key once', typeof deviceKey === 'string' && deviceKey.startsWith('cbt_dev_'))
  check('Claim returns the school slug', claim.body?.data?.school?.slug === 'demo-academy')

  const reuse = await anon.call('POST', '/api/local-servers/claim', {
    body: { setupCode, machineName: 'security-smoke', appVersion: '0.1.0' },
  })
  check('A used setup code cannot be claimed again', reuse.status === 400, errorCode(reuse))

  const deviceWorks = await anon.call('GET', '/api/sync/exams', { bearer: deviceKey })
  check('The minted device key authenticates', deviceWorks.status === 200, errorCode(deviceWorks))
  check('Device sees only stageable exams', Array.isArray(deviceWorks.body?.data?.exams))

  /* ---------------------------------------------------------------- *
   * Rotation and revocation
   * ---------------------------------------------------------------- */

  section('Device key rotation and revocation')

  const rotated = await staff.call('POST', `/api/local-servers/${serverId}/rotate-key`)
  check('Admin can rotate the device key', rotated.status === 200, errorCode(rotated))
  const rotatedKey = rotated.body?.data?.deviceKey?.value
  check('Rotation returns a new key once', typeof rotatedKey === 'string' && rotatedKey.startsWith('cbt_dev_'))

  const oldKeyAfterRotation = await anon.call('GET', '/api/sync/exams', { bearer: deviceKey })
  check('The previous key stops working immediately', oldKeyAfterRotation.status === 401, errorCode(oldKeyAfterRotation))

  const newKeyWorks = await anon.call('GET', '/api/sync/exams', { bearer: rotatedKey })
  check('The rotated key authenticates', newKeyWorks.status === 200, errorCode(newKeyWorks))

  const revoked = await staff.call('PATCH', `/api/local-servers/${serverId}`, { body: { isActive: false } })
  check('Admin can revoke the hall', revoked.status === 200, errorCode(revoked))

  const afterRevoke = await anon.call('GET', '/api/sync/exams', { bearer: rotatedKey })
  check('A revoked hall cannot sync', afterRevoke.status === 401, errorCode(afterRevoke))

  /* ---------------------------------------------------------------- *
   * Throttles (last: they deliberately exhaust their buckets)
   * ---------------------------------------------------------------- */

  section('Login throttle')

  const lockEmail = `smoke-lockout-${Date.now()}@example.test`
  for (let attempt = 1; attempt <= 5; attempt++) {
    const result = await anon.call('POST', '/api/auth/staff/login', {
      body: { email: lockEmail, password: 'wrong-password' },
    })
    check(`Wrong login attempt ${attempt} is 401`, result.status === 401, errorCode(result))
  }

  const locked = await anon.call('POST', '/api/auth/staff/login', {
    body: { email: lockEmail, password: 'wrong-password' },
  })
  check('The sixth failure is throttled', locked.status === 429, errorCode(locked))
  check('Throttle response uses RATE_LIMITED', locked.body?.error?.code === 'RATE_LIMITED')
  check('Throttle response includes Retry-After', Number(locked.headers.get('retry-after')) >= 1)

  section('Pairing-code throttle')

  const statuses = []
  let saw429 = false
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await anon.call('POST', '/api/local-servers/claim', {
      body: { setupCode: randomSetupCode() },
    })
    statuses.push(result.status)
    if (result.status === 429) {
      saw429 = true
      break
    }
  }
  check('Repeated invalid claims are eventually throttled', saw429, statuses.join(','))
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) {
      console.log(`\nFailed checks:\n${failures.map((line) => `  - ${line}`).join('\n')}`)
      process.exitCode = 1
    }
    console.log('')
  })
  .catch((error) => {
    console.error(`\nSecurity smoke test crashed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
