#!/usr/bin/env node
/**
 * END-TO-END SMOKE TEST
 * =====================
 *
 * Drives a running server over HTTP exactly as a browser would, to prove the M1 exam
 * flow works when wired together: staff login -> student login -> start -> autosave ->
 * heartbeat -> flags -> submit -> results, plus the tenant/class-level refusals.
 *
 * Not a unit-test replacement. It catches the class of breakage unit tests structurally
 * cannot — a route that never got exported, a cookie that isn't set, a Prisma filter that
 * throws only against real Postgres, a migration that was never applied.
 *
 *   1. npm run db:seed      (creates the demo school this script logs into)
 *   2. npm run dev
 *   3. npm run smoke
 *
 * Exits non-zero if any check fails, so it can gate a deploy.
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

const DEMO = {
  slug: 'demo-academy',
  teacher: { email: 'teacher@demo-academy.local', password: process.env.SEED_DEMO_PASSWORD ?? 'DemoPassword123!' },
  // Tried in order — maxAttempts is 1, so each run consumes one student's only attempt.
  jss2Students: [
    { regNumber: 'STU001', pin: '246813' },
    { regNumber: 'STU002', pin: '481920' },
    { regNumber: 'STU003', pin: '735291' },
  ],
  // SS1, so the JSS2 exam must be refused for them (PRD §3.2).
  wrongClassStudent: { regNumber: 'STU004', pin: '592734' },
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

/**
 * A client with its own cookie jar.
 *
 * Session tokens are httpOnly cookies and are deliberately absent from the login
 * response body, so there is no token to pass as a Bearer header — the jar is the only
 * way to stay authenticated. Separate instances also let a staff and two student
 * sessions be held at once without treading on each other, which is what the separate
 * cookie names in lib/auth/cookies.ts exist to allow.
 */
function createClient(name) {
  const jar = new Map()

  return {
    name,
    async call(method, path, body) {
      const headers = {}
      if (body !== undefined) headers['content-type'] = 'application/json'
      if (jar.size > 0) {
        headers.cookie = [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
      }

      let response
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: 'manual',
        })
      } catch (error) {
        throw new Error(`${method} ${path} — could not reach ${BASE_URL}. Is \`npm run dev\` running? (${error.message})`)
      }

      // getSetCookie() is the only correct reader here: multiple Set-Cookie headers
      // cannot be recovered from a comma-joined headers.get('set-cookie'), because
      // Expires dates contain commas too.
      const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
      for (const raw of cookies) {
        const [pair] = raw.split(';')
        const index = pair.indexOf('=')
        if (index < 1) continue
        const key = pair.slice(0, index).trim()
        const value = pair.slice(index + 1).trim()
        // Max-Age=0 is a logout; drop it so the jar reflects a real browser.
        if (value === '' || /max-age=0/i.test(raw)) jar.delete(key)
        else jar.set(key, value)
      }

      const text = await response.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        // A non-JSON body means an unhandled crash or an HTML error page — surfaced
        // through `raw` below rather than swallowed.
      }

      return { status: response.status, body: json, raw: text }
    },
  }
}

function errorCode(result) {
  return result.body?.error?.code ?? `HTTP ${result.status}`
}

async function main() {
  console.log(`\nCBT smoke test against ${BASE_URL}`)

  /* ---------------------------------------------------------------- *
   * Unauthenticated access
   * ---------------------------------------------------------------- */

  section('Auth guards')
  const anon = createClient('anon')

  const noAuthExams = await anon.call('GET', '/api/exams')
  check('GET /api/exams without a session is 401', noAuthExams.status === 401, errorCode(noAuthExams))

  const noAuthStudent = await anon.call('GET', '/api/student/exams')
  check('GET /api/student/exams without a session is 401', noAuthStudent.status === 401, errorCode(noAuthStudent))

  const badLogin = await anon.call('POST', '/api/auth/staff/login', {
    email: DEMO.teacher.email,
    password: 'definitely-the-wrong-password',
  })
  check('Staff login with a wrong password is 401', badLogin.status === 401, errorCode(badLogin))

  /* ---------------------------------------------------------------- *
   * Staff
   * ---------------------------------------------------------------- */

  section('Staff (teacher)')
  const staff = createClient('teacher')

  const staffLogin = await staff.call('POST', '/api/auth/staff/login', DEMO.teacher)
  check('Teacher can log in', staffLogin.status === 200, errorCode(staffLogin))
  if (staffLogin.status !== 200) {
    throw new Error('Cannot continue without a staff session. Has `npm run db:seed` been run?')
  }
  check('Login returns the role for frontend routing', staffLogin.body?.data?.user?.role === 'TEACHER')
  check('Login does not leak a token in the body', staffLogin.body?.data?.token === undefined)

  const me = await staff.call('GET', '/api/auth/staff/me')
  check('GET /api/auth/staff/me resolves the session', me.status === 200, errorCode(me))

  const examList = await staff.call('GET', '/api/exams')
  check('Teacher can list exams', examList.status === 200, errorCode(examList))

  const exam = examList.body?.data?.exams?.find((candidate) => candidate.classLevel === 'JSS2' && candidate.isPublished)
  check('Seeded JSS2 exam is present and published', Boolean(exam), 'run `npm run db:seed`')
  if (!exam) throw new Error('Cannot continue without the seeded JSS2 exam.')

  const invigilate = await staff.call('GET', `/api/exams/${exam.id}/sessions`)
  check('Teacher can read the invigilation view', invigilate.status === 200, errorCode(invigilate))

  /* ---------------------------------------------------------------- *
   * Class-level enforcement — the check PRD §3.2 singles out
   * ---------------------------------------------------------------- */

  section('Class-level isolation')
  const wrongClass = createClient('ss1-student')

  const wrongClassLogin = await wrongClass.call('POST', '/api/auth/student/login', {
    schoolSlug: DEMO.slug,
    ...DEMO.wrongClassStudent,
  })
  check('SS1 student can log in', wrongClassLogin.status === 200, errorCode(wrongClassLogin))

  const ss1Exams = await wrongClass.call('GET', '/api/student/exams')
  const ss1SeesJss2 = ss1Exams.body?.data?.exams?.some((candidate) => candidate.id === exam.id)
  check('SS1 student does not see the JSS2 exam in their list', ss1SeesJss2 === false)

  // The one that matters: not merely hidden in the list, but refused when named directly.
  const ss1Start = await wrongClass.call('POST', `/api/student/exams/${exam.id}/start`, undefined)
  check(
    'SS1 student is refused when starting the JSS2 exam by direct API call',
    ss1Start.status === 403 && errorCode(ss1Start) === 'WRONG_CLASS_LEVEL',
    `${ss1Start.status} ${errorCode(ss1Start)}`,
  )

  /* ---------------------------------------------------------------- *
   * Full exam sitting
   * ---------------------------------------------------------------- */

  section('Exam sitting (JSS2 student)')

  let student = null
  let start = null

  for (const candidate of DEMO.jss2Students) {
    const client = createClient(candidate.regNumber)
    const login = await client.call('POST', '/api/auth/student/login', { schoolSlug: DEMO.slug, ...candidate })
    if (login.status !== 200) continue

    const attempt = await client.call('POST', `/api/student/exams/${exam.id}/start`, undefined)
    if (attempt.status === 200 || attempt.status === 201) {
      student = { client, regNumber: candidate.regNumber }
      start = attempt
      break
    }
    // Attempt already used by an earlier run — try the next student rather than fail.
    if (errorCode(attempt) !== 'ATTEMPT_LIMIT_REACHED') {
      check(`Starting the exam as ${candidate.regNumber}`, false, `${attempt.status} ${errorCode(attempt)}`)
    }
  }

  if (!student) {
    console.log('\n  SKIP  every seeded JSS2 student has used their single attempt.')
    console.log('        Reset with:  npx prisma migrate reset  &&  npm run db:seed')
    return
  }

  check(`Student ${student.regNumber} started the exam`, true)

  const paper = start.body?.data
  check('Paper contains questions', Array.isArray(paper?.questions) && paper.questions.length > 0)
  check('Server returns an authoritative deadline', typeof paper?.session?.deadline === 'string')
  check('Server returns secondsRemaining', typeof paper?.session?.secondsRemaining === 'number')

  /**
   * The answer key must be structurally absent from anything a student receives
   * (STUDENT_PAPER_SELECT in lib/grading.ts). Checked against the serialised response so
   * the assertion holds regardless of how the object is shaped.
   */
  check('No option exposes isCorrect to the student', !JSON.stringify(paper.questions).includes('isCorrect'))

  const sessionId = paper.session.id
  check('Session id issued', typeof sessionId === 'string' && sessionId.length > 0)

  // Answer every question by picking its first option. Correctness is irrelevant — what
  // is under test is that autosave persists and submission grades.
  let saved = 0
  for (const question of paper.questions) {
    const first = question.options[0]
    if (!first) continue
    const save = await student.client.call(
      'PUT',
      `/api/student/sessions/${sessionId}/answers/${question.id}`,
      { selectedOptionIds: [first.id] },
    )
    if (save.status === 200) saved++
    else check(`Autosaving question ${question.id}`, false, `${save.status} ${errorCode(save)}`)
  }
  check(`Autosaved all ${paper.questions.length} answers`, saved === paper.questions.length, `saved ${saved}`)

  // An option from a different question must be rejected, or it would grade as
  // permanently wrong (assertOptionsBelongToQuestion in lib/grading.ts).
  if (paper.questions.length >= 2) {
    const [firstQuestion, secondQuestion] = paper.questions
    const foreignOption = secondQuestion.options[0]
    const crossSave = await student.client.call(
      'PUT',
      `/api/student/sessions/${sessionId}/answers/${firstQuestion.id}`,
      { selectedOptionIds: [foreignOption.id] },
    )
    check("An option from another question is rejected", crossSave.status === 409, `${crossSave.status} ${errorCode(crossSave)}`)
  }

  const heartbeat = await student.client.call('GET', `/api/student/sessions/${sessionId}`)
  check('Heartbeat returns session state', heartbeat.status === 200, errorCode(heartbeat))
  check('Heartbeat reports answered progress', heartbeat.body?.data?.progress?.answeredCount === saved)
  check('Heartbeat does not include the paper', heartbeat.body?.data?.questions === undefined)

  const flags = await student.client.call('POST', `/api/student/sessions/${sessionId}/flags`, {
    events: [{ type: 'TAB_BLUR' }, { type: 'WINDOW_BLUR' }],
  })
  check('Security flags are recorded', flags.status === 200, errorCode(flags))
  check('Both flag events stored', flags.body?.data?.recorded === 2)

  // Logging a flag must NOT end the exam (PRD §4.4 — logged, not auto-penalised).
  const afterFlags = await student.client.call('GET', `/api/student/sessions/${sessionId}`)
  check('Session is still IN_PROGRESS after a flag', afterFlags.body?.data?.session?.status === 'IN_PROGRESS')

  const submit = await student.client.call('POST', `/api/student/sessions/${sessionId}/submit`, undefined)
  check('Exam submits', submit.status === 200, errorCode(submit))
  check('Submission is graded immediately', typeof submit.body?.data?.result?.score === 'number', 'score missing')
  check('Submission reports maxScore', typeof submit.body?.data?.result?.maxScore === 'number')

  const doubleSubmit = await student.client.call('POST', `/api/student/sessions/${sessionId}/submit`, undefined)
  check(
    'A second submit is refused',
    doubleSubmit.status === 409,
    `${doubleSubmit.status} ${errorCode(doubleSubmit)}`,
  )

  const lateSave = await student.client.call(
    'PUT',
    `/api/student/sessions/${sessionId}/answers/${paper.questions[0].id}`,
    { selectedOptionIds: [paper.questions[0].options[0].id] },
  )
  check('Answers are refused after submission', lateSave.status === 409, `${lateSave.status} ${errorCode(lateSave)}`)

  /* ---------------------------------------------------------------- *
   * Results
   * ---------------------------------------------------------------- */

  section('Results')

  const results = await student.client.call('GET', '/api/student/results')
  check('Student can read their own results', results.status === 200, errorCode(results))
  const ownResult = results.body?.data?.results?.find((entry) => entry.sessionId === sessionId)
  check('The submitted session appears in results', Boolean(ownResult))
  check('Result carries a percentage', typeof ownResult?.percentage === 'number')
  check('Results do not leak the answer key', !JSON.stringify(results.body?.data?.results ?? []).includes('isCorrect'))

  const staffView = await staff.call('GET', `/api/exams/${exam.id}/sessions?status=SUBMITTED`)
  const staffSees = staffView.body?.data?.sessions?.find((entry) => entry.id === sessionId)
  check('Teacher sees the submitted session', Boolean(staffSees), errorCode(staffView))
  check('Teacher sees the recorded security flags', (staffSees?.securityFlagCount ?? 0) >= 2)

  const sweep = await staff.call('POST', `/api/exams/${exam.id}/sessions/sweep-expired`, undefined)
  check('Sweep endpoint runs', sweep.status === 200, errorCode(sweep))
  check('Sweep does not touch already-closed sessions', sweep.body?.data?.swept === 0)

  /* ---------------------------------------------------------------- *
   * Logout
   * ---------------------------------------------------------------- */

  section('Logout')

  const logout = await student.client.call('POST', '/api/auth/student/logout', undefined)
  check('Student can log out', logout.status === 200, errorCode(logout))

  const afterLogout = await student.client.call('GET', '/api/student/exams')
  check('Session is unusable after logout', afterLogout.status === 401, errorCode(afterLogout))
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) {
      console.log(`\nFailed checks:\n${failures.map((label) => `  - ${label}`).join('\n')}`)
      process.exitCode = 1
    }
    console.log('')
  })
  .catch((error) => {
    console.error(`\nSmoke test aborted: ${error.message}\n`)
    process.exitCode = 1
  })
