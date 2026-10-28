import { useEffect, useState, type ReactNode } from 'react'
import { ApiError, api, errorMessage, getToken, setToken } from '../lib/api'
import type { Student, StudentExam } from '../lib/types'
import { Alert, Brand, Icon, Loading, Spinner } from '../components/ui'
import { ExamRunner } from './ExamRunner'

type HallHealth = {
  status: string
  school: { name: string; slug: string } | null
  localServer: { id: string; name: string } | null
  staged: { exams: number; students: number }
}

type LoginResult = {
  token: string
  expiresAt: string
  student: Student
}

export function StudentPortal() {
  const [student, setStudent] = useState<Student | null>(() => {
    try {
      const raw = sessionStorage.getItem('cbt_hall_student')
      return raw ? (JSON.parse(raw) as Student) : null
    } catch {
      return null
    }
  })
  const [exams, setExams] = useState<StudentExam[]>([])
  const [health, setHealth] = useState<HallHealth | null>(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [error, setError] = useState<string | null>(null)
  const [activeExamId, setActiveExamId] = useState<string | null>(null)

  useEffect(() => {
    api<HallHealth>('GET', '/api/health', undefined, { auth: false }).then(setHealth).catch(() => undefined)
  }, [])

  async function loadExams() {
    if (!getToken()) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await api<{ student: Student; exams: StudentExam[] }>('GET', '/api/student/exams')
      setStudent(data.student)
      setExams(data.exams)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession()
        setError('Your session ended. Sign in again.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadExams()
  }, [])

  function clearSession() {
    setToken(null)
    sessionStorage.removeItem('cbt_hall_student')
    setStudent(null)
    setExams([])
  }

  if (activeExamId) {
    return <ExamRunner examId={activeExamId} onExit={() => { setActiveExamId(null); void loadExams() }} />
  }

  if (loading) {
    return <PageShell health={health}><Loading message="Loading your exams…" /></PageShell>
  }

  if (!student) {
    return (
      <PageShell health={health}>
        <div className="mx-auto w-full max-w-md animate-fade-in">
          <div className="mb-8 flex justify-center"><Brand /></div>
          <section className="card">
            <div className="mb-5">
              <h1 className="text-2xl font-bold text-on-surface">Student sign in</h1>
              <p className="mt-1 text-sm text-on-surface-variant">Use the registration number and PIN given by your school.</p>
            </div>
            <LoginForm
              error={error}
              onLogin={async (regNumber, pin) => {
                setError(null)
                const result = await api<LoginResult>('POST', '/api/auth/student/login', { regNumber, pin }, { auth: false })
                setToken(result.token)
                sessionStorage.setItem('cbt_hall_student', JSON.stringify(result.student))
                setStudent(result.student)
                await loadExams()
              }}
            />
          </section>
          <p className="mt-4 text-center text-xs text-on-surface-variant">
            Using {health?.localServer?.name ?? 'this exam hall'} · {health?.school?.name ?? 'School'}
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell health={health}>
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Brand />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-on-surface">{student.fullName}</p>
              <p className="text-xs text-on-surface-variant">
                {student.regNumber} · {student.classLevel}
              </p>
            </div>
            <button
              className="btn-secondary px-3 py-2"
              onClick={() => {
                void api('POST', '/api/auth/student/logout').catch(() => undefined)
                clearSession()
              }}
            >
              <Icon name="logout" size={18} /> Sign out
            </button>
          </div>
        </header>

        {error ? <Alert tone="danger" onDismiss={() => setError(null)}>{error}</Alert> : null}

        <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <p className="label">Available exams</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Only exams scheduled for {student.classLevel} appear here. Choose an exam when the invigilator tells you to start.
          </p>
        </div>

        {exams.length === 0 ? (
          <div className="card text-center">
            <Icon name="event_busy" size={40} className="text-on-surface-variant" />
            <p className="mt-3 font-semibold text-on-surface">No exams available right now</p>
            <p className="mt-1 text-sm text-on-surface-variant">If an exam should be here, ask the invigilator to check the hall server.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {exams.map((exam) => (
              <li key={exam.id} className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container/30 text-primary">
                    <Icon name="description" filled size={26} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-on-surface">{exam.title}</h2>
                    <p className="text-sm text-on-surface-variant">
                      {exam.subject} · {exam.questionCount} questions · {exam.durationMins} minutes
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {exam.windowState === 'OPEN'
                        ? exam.attempts.remaining > 0
                          ? `${exam.attempts.remaining} attempt${exam.attempts.remaining === 1 ? '' : 's'} available`
                          : 'No attempts remaining'
                        : exam.windowState === 'NOT_YET_OPEN'
                          ? 'Not open yet'
                          : 'Closed'}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {exam.activeSession ? (
                    <button className="btn-primary" onClick={() => setActiveExamId(exam.id)}>
                      <Icon name="play_arrow" size={20} /> Resume
                    </button>
                  ) : (
                    <button className="btn-primary" disabled={!exam.canStart} onClick={() => setActiveExamId(exam.id)}>
                      <Icon name="play_arrow" size={20} /> Start exam
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-center text-xs text-on-surface-variant">
          Answers save automatically. Do not close this tab until you submit.
        </p>
      </div>
    </PageShell>
  )
}

function PageShell({ children, health }: { children: ReactNode; health: HallHealth | null }) {
  return (
    <main className="min-h-screen bg-background px-4 py-6 md:px-8">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-1.5 bg-primary-container" />
      {children}
      <footer className="mx-auto mt-8 max-w-4xl text-center text-xs text-on-surface-variant">
        {health?.status === 'ready'
          ? `${health.school?.name ?? 'Exam hall'} · offline exam server`
          : 'Exam hall server · waiting for setup'}
      </footer>
    </main>
  )
}

function LoginForm({ error, onLogin }: { error: string | null; onLogin: (reg: string, pin: string) => Promise<void> }) {
  const [regNumber, setRegNumber] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setLocalError(null)
        try {
          await onLogin(regNumber.trim(), pin)
        } catch (err) {
          setLocalError(errorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      {error ? <Alert tone="danger" onDismiss={() => setLocalError(null)}>{error}</Alert> : null}
      {localError ? <Alert tone="danger" onDismiss={() => setLocalError(null)}>{localError}</Alert> : null}
      <label className="block">
        <span className="label mb-1.5 block">Registration number</span>
        <input className="input" value={regNumber} onChange={(event) => setRegNumber(event.target.value)} autoComplete="username" autoFocus required />
      </label>
      <label className="block">
        <span className="label mb-1.5 block">PIN</span>
        <input
          className="input font-mono tracking-widest"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          maxLength={8}
          autoComplete="current-password"
          required
        />
      </label>
      <button className="btn-primary w-full py-3" disabled={busy}>
        {busy ? <Spinner size={18} /> : <Icon name="login" size={20} />}
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
