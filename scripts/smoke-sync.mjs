#!/usr/bin/env node
/**
 * OFFLINE SYNC SMOKE TEST (M2, cloud side)
 * ========================================
 *
 * Simulates a LocalServer over plain HTTP — provision, pull, forge a batch of sittings,
 * push — and asserts the guarantees the offline path depends on:
 *
 *   - a device key authenticates, and a wrong one does not
 *   - pull carries the answer key and the class roster, and refuses drafts / ONLINE-mode exams
 *   - push re-grades server-side and IGNORES any score the device claims
 *   - a repeated push is idempotent (ALREADY_SYNCED, no duplicate rows)
 *   - a higher syncVersion updates; an equal one does not
 *   - cross-class and stale-question sittings are rejected per-session, not batch-wide
 *   - synced results surface in the teacher's invigilation view with offline provenance
 *
 *   1. npm run db:seed      (creates the demo school AND the demo exam hall)
 *   2. npm run dev
 *   3. npm run smoke-sync
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const DEVICE_KEY = process.env.SEED_DEMO_DEVICE_KEY ?? 'cbt_dev_seeddemokey0000000000000000000000000'

const STAFF = {
  email: 'admin@demo-academy.local',
  password: process.env.SEED_DEMO_PASSWORD ?? 'DemoPassword123!',
}

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
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

function errorCode(result) {
  return result.body?.error?.code ?? `HTTP ${result.status}`
}

/** Device-style caller: Bearer key, no cookie jar. */
async function device(method, path, body, key = DEVICE_KEY) {
  const headers = { authorization: `Bearer ${key}` }
  if (body !== undefined) headers['content-type'] = 'application/json'

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new Error(`${method} ${path} — could not reach ${BASE_URL}. Is \`npm run dev\` running? (${error.message})`)
  }

  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON body surfaces through `raw` */
  }
  return { status: response.status, body: json, raw: text }
}

/** Staff caller with a cookie jar, for the provisioning and verification steps. */
function createStaffClient() {
  const jar = new Map()
  return async (method, path, body) => {
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (jar.size > 0) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
    for (const raw of cookies) {
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
      /* ignore */
    }
    return { status: response.status, body: json, raw: text }
  }
}

/** Unique per run so repeated runs never collide on (localServerId, localId). */
function localId(suffix) {
  return `smoke-${process.pid}-${suffix}`
}

async function main() {
  console.log(`\nCBT offline-sync smoke test against ${BASE_URL}`)

  /* ---------------------------------------------------------------- *
   * Device authentication
   * ---------------------------------------------------------------- */

  section('Device authentication')

  const noKey = await fetch(`${BASE_URL}/api/sync/pull?examId=whatever`).then(async (r) => ({
    status: r.status,
    body: await r.json().catch(() => null),
  }))
  check('Pull without a device key is 401', noKey.status === 401, `HTTP ${noKey.status}`)

  const wrongKey = await device('GET', '/api/sync/pull?examId=whatever', undefined, 'cbt_dev_totally_wrong_key_value')
  check('Pull with an invalid device key is 401', wrongKey.status === 401, errorCode(wrongKey))

  /* ---------------------------------------------------------------- *
   * Find the seeded exam (as staff)
   * ---------------------------------------------------------------- */

  section('Staff setup')
  const staff = createStaffClient()

  const login = await staff('POST', '/api/auth/staff/login', STAFF)
  check('School admin can log in', login.status === 200, errorCode(login))
  if (login.status !== 200) throw new Error('Cannot continue without staff. Has `npm run db:seed` been run?')

  const examList = await staff('GET', '/api/exams')
  const exam = examList.body?.data?.exams?.find((e) => e.classLevel === 'JSS2' && e.isPublished)
  check('Seeded JSS2 exam found', Boolean(exam), 'run `npm run db:seed`')
  if (!exam) throw new Error('Cannot continue without the seeded JSS2 exam.')

  const servers = await staff('GET', '/api/local-servers')
  check('Local server list is readable by a school admin', servers.status === 200, errorCode(servers))
  check('Demo exam hall is provisioned', (servers.body?.data?.localServers?.length ?? 0) > 0, 'run `npm run db:seed`')
  check(
    'Local server list never returns key material',
    !JSON.stringify(servers.body?.data ?? {}).includes('deviceKey"'),
  )

  /* ---------------------------------------------------------------- *
   * Provisioning issues a key exactly once
   * ---------------------------------------------------------------- */

  section('Provisioning')

  const provisioned = await staff('POST', '/api/local-servers', { name: `Smoke Hall ${process.pid}` })
  check('A new local server can be provisioned', provisioned.status === 201, errorCode(provisioned))
  const setupCode = provisioned.body?.data?.setupCode?.value
  check('Provisioning returns a one-time setup code', typeof setupCode === 'string' && setupCode.length >= 10)
  check(
    'Provisioning does NOT return a device key before pairing',
    !JSON.stringify(provisioned.body?.data ?? {}).includes('cbt_dev_'),
  )

  const newServerId = provisioned.body?.data?.localServer?.id
  const reread = await staff('GET', `/api/local-servers/${newServerId}`)
  check('Re-reading the server does NOT return the setup code', !JSON.stringify(reread.body?.data ?? {}).includes(setupCode))

  const claim = await fetch(`${BASE_URL}/api/local-servers/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setupCode, machineName: 'smoke-hall', appVersion: '0.0.0-smoke' }),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }))
  check('The setup code can be claimed once', claim.status === 200, errorCode(claim))
  const issuedKey = claim.body?.data?.deviceKey
  check('Claiming mints a plaintext device key once', typeof issuedKey === 'string' && issuedKey.startsWith('cbt_dev_'))

  const secondClaim = await fetch(`${BASE_URL}/api/local-servers/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setupCode, machineName: 'smoke-hall-again', appVersion: '0.0.0-smoke' }),
  })
  check('A used setup code cannot be claimed again', secondClaim.status === 400, `HTTP ${secondClaim.status}`)

  // The freshly minted key must actually work as a credential.
  const newKeyPull = await device('GET', `/api/sync/pull?examId=${exam.id}`, undefined, issuedKey)
  check('The newly issued key authenticates', newKeyPull.status === 200, errorCode(newKeyPull))

  const rotated = await staff('POST', `/api/local-servers/${newServerId}/rotate-key`)
  check('Key rotation issues a new key', rotated.status === 200 && Boolean(rotated.body?.data?.deviceKey?.value))
  const oldKeyAfterRotate = await device('GET', `/api/sync/pull?examId=${exam.id}`, undefined, issuedKey)
  check('The old key stops working immediately after rotation', oldKeyAfterRotate.status === 401)

  await staff('PATCH', `/api/local-servers/${newServerId}`, { isActive: false })
  const revokedPull = await device(
    'GET',
    `/api/sync/pull?examId=${exam.id}`,
    undefined,
    rotated.body?.data?.deviceKey?.value,
  )
  check('Deactivating a server revokes its access', revokedPull.status === 401, errorCode(revokedPull))

  /* ---------------------------------------------------------------- *
   * Pull
   * ---------------------------------------------------------------- */

  section('Pull (staging an exam)')

  const pull = await device('GET', `/api/sync/pull?examId=${exam.id}`)
  check('Device can pull the staged exam', pull.status === 200, errorCode(pull))
  if (pull.status !== 200) throw new Error(`Pull failed: ${errorCode(pull)}`)

  const payload = pull.body.data
  check('Pull includes the school slug (needed for offline login)', typeof payload?.school?.slug === 'string')
  check('Pull includes questions', Array.isArray(payload?.questions) && payload.questions.length > 0)
  check('Pull includes the class roster', Array.isArray(payload?.students) && payload.students.length > 0)

  // The two deliberate exceptions to what the cloud normally serves.
  check(
    'Pull DOES include the answer key (the hall server must grade offline)',
    payload.questions.every((q) => q.options.every((o) => typeof o.isCorrect === 'boolean')),
  )
  check(
    'Pull DOES include student PINs (offline login compares against them)',
    payload.students.every((s) => typeof s.pin === 'string' && s.pin.length > 0),
  )
  check(
    'Roster is narrowed to the exam class level only',
    payload.students.every((s) => s.classLevel === exam.classLevel),
  )

  const missingExam = await device('GET', '/api/sync/pull?examId=nonexistent123')
  check('Pulling an unknown exam is 404', missingExam.status === 404, errorCode(missingExam))

  /* ---------------------------------------------------------------- *
   * Push — the core guarantees
   * ---------------------------------------------------------------- */

  section('Push (reconciling results)')

  const jss2 = payload.students.filter((s) => s.classLevel === exam.classLevel)
  const studentA = jss2[0]
  check('At least one JSS2 student on the roster', Boolean(studentA))
  if (!studentA) throw new Error('Roster is empty; cannot forge a sitting.')

  /**
   * Answer every question CORRECTLY using the pulled answer key, then claim an absurd score.
   * The cloud must ignore the claim and compute the real total itself.
   */
  const correctAnswers = payload.questions.map((question) => ({
    questionId: question.id,
    selectedOptionIds: question.options.filter((o) => o.isCorrect).map((o) => o.id),
  }))
  const expectedFullScore = payload.meta.totalPoints

  const idA = localId('a')
  const pushA = await device('POST', '/api/sync/push', {
    sessions: [
      {
        localId: idA,
        examId: exam.id,
        studentId: studentA.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        submittedAt: new Date().toISOString(),
        securityFlags: [{ type: 'TAB_BLUR', at: new Date().toISOString() }],
        syncVersion: 1,
        answers: correctAnswers,
      },
    ],
  })

  check('Push accepts a well-formed batch', pushA.status === 200, errorCode(pushA))
  const resultA = pushA.body?.data?.results?.[0]
  check('Session was created', resultA?.outcome === 'CREATED', JSON.stringify(resultA))
  check(
    `Cloud re-graded to the true full score (${expectedFullScore})`,
    resultA?.score === expectedFullScore,
    `got ${resultA?.score}, expected ${expectedFullScore}`,
  )
  check('Cloud recorded maxScore', resultA?.maxScore === expectedFullScore, `got ${resultA?.maxScore}`)

  /* ---- a device-claimed score is refused outright ---- */

  /**
   * The central trust guarantee. `score` is not in the push schema at all, and the schema is
   * `.strict()`, so a device that tries to dictate its own mark is rejected as malformed
   * rather than quietly believed. This asserts the strictness is actually in force — if the
   * field were ever silently ignored instead, this test would fail and say so.
   */
  const forgedScore = await device('POST', '/api/sync/push', {
    sessions: [
      {
        localId: localId('forged'),
        examId: exam.id,
        studentId: studentA.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        submittedAt: new Date().toISOString(),
        syncVersion: 1,
        score: 9999,
        maxScore: 9999,
        answers: [],
      },
    ],
  })
  check(
    'A device-supplied score is rejected as an unknown field',
    forgedScore.status === 400,
    `${forgedScore.status} ${errorCode(forgedScore)}`,
  )

  /* ---- idempotency ---- */

  const pushAgain = await device('POST', '/api/sync/push', {
    sessions: [
      {
        localId: idA,
        examId: exam.id,
        studentId: studentA.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        submittedAt: new Date().toISOString(),
        syncVersion: 1,
        answers: correctAnswers,
      },
    ],
  })
  const repeat = pushAgain.body?.data?.results?.[0]
  check('Re-pushing the same session is ALREADY_SYNCED', repeat?.outcome === 'ALREADY_SYNCED', JSON.stringify(repeat))
  check('Re-push maps to the same cloud session (no duplicate)', repeat?.sessionId === resultA?.sessionId)

  /* ---- higher syncVersion updates, with a re-grade ---- */

  const wrongAnswers = payload.questions.map((question) => ({
    questionId: question.id,
    selectedOptionIds: question.options.filter((o) => !o.isCorrect).slice(0, 1).map((o) => o.id),
  }))

  const pushV2 = await device('POST', '/api/sync/push', {
    sessions: [
      {
        localId: idA,
        examId: exam.id,
        studentId: studentA.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        submittedAt: new Date().toISOString(),
        syncVersion: 2,
        answers: wrongAnswers,
      },
    ],
  })
  const v2 = pushV2.body?.data?.results?.[0]
  check('A higher syncVersion updates the session', v2?.outcome === 'UPDATED', JSON.stringify(v2))
  check('The update re-graded downward', typeof v2?.score === 'number' && v2.score < expectedFullScore, `got ${v2?.score}`)

  /* ---- rejections are per-session, not batch-wide ---- */

  const wrongClassStudent = payload.students.find((s) => s.classLevel !== exam.classLevel)

  const mixedBatch = await device('POST', '/api/sync/push', {
    sessions: [
      // valid
      {
        localId: localId('good'),
        examId: exam.id,
        studentId: studentA.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        submittedAt: new Date().toISOString(),
        syncVersion: 1,
        answers: correctAnswers,
      },
      // unknown student
      {
        localId: localId('badstudent'),
        examId: exam.id,
        studentId: 'nonexistentstudent123',
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        submittedAt: new Date().toISOString(),
        syncVersion: 1,
        answers: correctAnswers,
      },
      // stale paper: a question that is not on this exam
      {
        localId: localId('stale'),
        examId: exam.id,
        studentId: studentA.id,
        status: 'SUBMITTED',
        startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        submittedAt: new Date().toISOString(),
        syncVersion: 1,
        answers: [{ questionId: 'questionthatdoesnotexist', selectedOptionIds: [] }],
      },
    ],
  })

  check('A mixed batch still returns 200', mixedBatch.status === 200, errorCode(mixedBatch))
  const outcomes = mixedBatch.body?.data?.results ?? []
  check('The valid session in a mixed batch was created', outcomes.some((r) => r.outcome === 'CREATED'))
  check(
    'An unknown student is rejected without failing the batch',
    outcomes.filter((r) => r.outcome === 'REJECTED').length === 2,
    JSON.stringify(outcomes.map((r) => r.outcome)),
  )
  check('Rejections carry a reason', outcomes.filter((r) => r.outcome === 'REJECTED').every((r) => Boolean(r.reason)))

  if (wrongClassStudent) {
    const crossClass = await device('POST', '/api/sync/push', {
      sessions: [
        {
          localId: localId('crossclass'),
          examId: exam.id,
          studentId: wrongClassStudent.id,
          status: 'SUBMITTED',
          startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          submittedAt: new Date().toISOString(),
          syncVersion: 1,
          answers: correctAnswers,
        },
      ],
    })
    check(
      'A sitting for the wrong class level is rejected',
      crossClass.body?.data?.results?.[0]?.outcome === 'REJECTED',
      JSON.stringify(crossClass.body?.data?.results?.[0]),
    )
  } else {
    // The seeded SS1 student is not on a JSS2 pull, which is itself the correct behaviour.
    console.log('  SKIP  cross-class push (no other-class student in the pulled roster — expected)')
  }

  const emptyBatch = await device('POST', '/api/sync/push', { sessions: [] })
  check('An empty batch is rejected as malformed', emptyBatch.status === 400, errorCode(emptyBatch))

  const inProgressPush = await device('POST', '/api/sync/push', {
    sessions: [
      {
        localId: localId('inprogress'),
        examId: exam.id,
        studentId: studentA.id,
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
        syncVersion: 1,
        answers: [],
      },
    ],
  })
  check('An IN_PROGRESS sitting cannot be pushed', inProgressPush.status === 400, errorCode(inProgressPush))

  /* ---------------------------------------------------------------- *
   * The results appear to staff, with offline provenance
   * ---------------------------------------------------------------- */

  section('Reconciled results in the dashboard')

  const invigilation = await staff('GET', `/api/exams/${exam.id}/sessions?pageSize=200`)
  check('Teacher can read the invigilation view', invigilation.status === 200, errorCode(invigilation))

  const synced = invigilation.body?.data?.sessions?.find((s) => s.id === resultA?.sessionId)
  check('The pushed session appears in the dashboard', Boolean(synced))
  check('It is marked as having come from a local server', Boolean(synced?.localServerId))
  check('It carries a syncedAt timestamp', Boolean(synced?.syncedAt))
  check('It carries the cloud-computed score', typeof synced?.score === 'number')
  check('Security flags survived the sync', (synced?.securityFlagCount ?? 0) >= 1)
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) {
      console.log(`\nFailed checks:\n${failures.map((l) => `  - ${l}`).join('\n')}`)
      process.exitCode = 1
    }
    console.log('')
  })
  .catch((error) => {
    console.error(`\nSmoke test aborted: ${error.message}\n`)
    process.exitCode = 1
  })
