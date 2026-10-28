import { useEffect, useRef, useState } from 'react'
import { ApiError, api, errorMessage } from '../lib/api'
import type { PaperQuestion, StartExamResult, SubmitPayload, SubmitResult } from '../lib/types'
import { Alert, Icon, Loading, Modal, Spinner } from '../components/ui'

type Phase = 'starting' | 'active' | 'submitting' | 'finished' | 'blocked'

type Heartbeat = {
  session: { id: string; status: string; startedAt: string; submittedAt: string | null; deadline: string | null; secondsRemaining: number }
  progress: { answeredCount: number; totalQuestions: number; unansweredCount: number }
  autoSubmitted: SubmitPayload | null
  result: { score: number | null; maxScore: number | null } | null
  serverTime: string
}

const LETTERS = ['A', 'B', 'C', 'D'] as const

export function ExamRunner({ examId, onExit }: { examId: string; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('starting')
  const [paper, setPaper] = useState<StartExamResult | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Map<string, string[]>>(new Map())
  const [review, setReview] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const deadlineRef = useRef(0)
  const submittingRef = useRef(false)
  const resultRef = useRef<SubmitResult | null>(null)
  const sessionId = paper?.session.id ?? null

  useEffect(() => {
    let cancelled = false
    api<StartExamResult>('POST', `/api/student/exams/${encodeURIComponent(examId)}/start`, {})
      .then((data) => {
        if (cancelled) return
        setPaper(data)
        setAnswers(new Map(data.savedAnswers.map((entry) => [entry.questionId, entry.selectedOptionIds])))
        setSeconds(data.session.secondsRemaining)
        deadlineRef.current = Date.now() + data.session.secondsRemaining * 1000
        setPhase('active')
      })
      .catch((err) => {
        if (cancelled) return
        setBlocked(errorMessage(err))
        setPhase('blocked')
      })
    return () => {
      cancelled = true
    }
  }, [examId])

  useEffect(() => {
    if (phase !== 'active') return
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      setSeconds(remaining)
      if (remaining <= 0) void submit(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'active' || !sessionId) return
    const timer = window.setInterval(async () => {
      try {
        const data = await api<Heartbeat>('GET', `/api/student/sessions/${encodeURIComponent(sessionId)}`)
        setSeconds(data.session.secondsRemaining)
        deadlineRef.current = Date.now() + data.session.secondsRemaining * 1000

        if (data.autoSubmitted) {
          finishWithPayload(data.autoSubmitted)
        } else if (data.session.status !== 'IN_PROGRESS') {
          setSubmitError('This exam has already been submitted.')
        }
      } catch {
        // A missed heartbeat is not fatal: the next answer save re-syncs the clock.
      }
    }, 25_000)
    return () => window.clearInterval(timer)
  }, [phase, sessionId])

  function finishWithPayload(payload: SubmitPayload) {
    if (resultRef.current) return
    const next: SubmitResult = {
      session: { id: sessionId ?? '', status: 'SUBMITTED', submittedAt: new Date().toISOString() },
      result: payload,
      exam: { id: examId, title: paper?.exam.title ?? 'Exam' },
    }
    resultRef.current = next
    setResult(next)
    setPhase('finished')
  }

  async function submit(automatic = false) {
    if (!sessionId || submittingRef.current || resultRef.current) return
    if (!automatic) setConfirmOpen(false)
    submittingRef.current = true
    setPhase('submitting')
    setSubmitError(null)
    try {
      const data = await api<SubmitResult>('POST', `/api/student/sessions/${encodeURIComponent(sessionId)}/submit`, {})
      resultRef.current = data
      setResult(data)
      setPhase('finished')
    } catch (err) {
      submittingRef.current = false
      setPhase('active')
      setSubmitError(errorMessage(err))
    }
  }

  async function choose(question: PaperQuestion, optionId: string) {
    if (phase !== 'active' || !sessionId) return
    const multiple = question.type === 'MULTIPLE_CHOICE'
    const previous = answers.get(question.id) ?? []
    const next = multiple
      ? previous.includes(optionId)
        ? previous.filter((id) => id !== optionId)
        : [...previous, optionId]
      : [optionId]

    setAnswers((current) => new Map(current).set(question.id, next))
    setSaving((current) => new Set(current).add(question.id))
    setSaveError(null)

    try {
      const data = await api<{ secondsRemaining: number }>(
        'PUT',
        `/api/student/sessions/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(question.id)}`,
        { selectedOptionIds: next },
      )
      setSeconds(data.secondsRemaining)
      deadlineRef.current = Date.now() + data.secondsRemaining * 1000
    } catch (err) {
      setSaveError(errorMessage(err))
    } finally {
      setSaving((current) => {
        const copy = new Set(current)
        copy.delete(question.id)
        return copy
      })
    }
  }

  if (phase === 'starting') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <Loading message="Preparing your paper…" />
      </main>
    )
  }

  if (phase === 'blocked') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="card w-full max-w-md text-center">
          <Icon name="block" size={42} className="text-error" />
          <h1 className="mt-3 text-xl font-bold">You cannot start this exam</h1>
          <p className="mt-2 text-sm text-on-surface-variant">{blocked}</p>
          <button className="btn-secondary mt-5 w-full" onClick={onExit}>Back to my exams</button>
        </div>
      </main>
    )
  }

  if (phase === 'finished' && result) {
    return <ResultScreen result={result} onExit={onExit} />
  }

  if (!paper) return null

  const question = paper.questions[index]
  const selected = answers.get(question.id) ?? []
  const answered = [...answers.values()].filter((ids) => ids.length > 0).length
  const critical = seconds <= 300

  return (
    <main className="min-h-screen bg-background pb-8">
      <header className="sticky top-0 z-30 border-b border-outline-variant/60 bg-surface/95 px-4 py-3 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-on-surface md:text-lg">{paper.exam.title}</h1>
            <p className="text-xs text-on-surface-variant">{paper.exam.subject} · {paper.exam.classLevel}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Answered</p>
              <p className="text-sm font-bold text-primary">{answered} / {paper.questions.length}</p>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${critical ? 'animate-pulse border-error/30 bg-error-container/60 text-error' : 'border-outline-variant bg-surface-container'}`}>
              <Icon name="timer" filled size={18} />
              <span className="tabular text-base font-bold">{formatCountdown(seconds)}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto mt-5 grid max-w-5xl gap-5 px-4 md:grid-cols-[1fr_260px] md:px-8">
        <div className="min-w-0">
          {saveError ? <Alert tone="warning" title="An answer may not have saved" onDismiss={() => setSaveError(null)}>{saveError} Re-select the option to retry.</Alert> : null}
          {submitError ? <Alert tone="danger" title="Could not submit" onDismiss={() => setSubmitError(null)}>{submitError}</Alert> : null}

          <section className="card relative">
            <div className="absolute -left-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-bold text-on-primary shadow-level-1 md:-left-3 md:-top-3">
              {index + 1}
            </div>
            <div className="mb-5 ml-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Question {index + 1} of {paper.questions.length} · {question.points} {question.points === 1 ? 'mark' : 'marks'}
                </p>
                <h2 className="mt-2 whitespace-pre-wrap text-xl font-semibold leading-snug text-on-surface">{question.text}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(review)
                  if (next.has(question.id)) next.delete(question.id)
                  else next.add(question.id)
                  setReview(next)
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${review.has(question.id) ? 'border-error bg-error-container/40 text-error' : 'border-outline-variant text-on-surface-variant'}`}
                aria-pressed={review.has(question.id)}
              >
                <Icon name="flag" filled={review.has(question.id)} size={16} />
                <span className="hidden sm:inline">{review.has(question.id) ? 'Flagged' : 'Flag'}</span>
              </button>
            </div>

            <p className="mb-4 text-sm italic text-on-surface-variant">
              {question.type === 'MULTIPLE_CHOICE'
                ? 'Select every option that applies.'
                : question.type === 'TRUE_FALSE'
                  ? 'Choose true or false.'
                  : 'Select the one correct answer.'}
              {saving.has(question.id) ? <span className="ml-2 inline-flex items-center gap-1 not-italic"><Spinner size={11} /> Saving…</span> : null}
            </p>

            <div className="grid gap-3 sm:grid-cols-2" role={question.type === 'MULTIPLE_CHOICE' ? 'group' : 'radiogroup'}>
              {question.options.map((option, optionIndex) => {
                const checked = selected.includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    role={question.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                    aria-checked={checked}
                    className={`option-card ${checked ? 'option-selected' : ''}`}
                    onClick={() => void choose(question, option.id)}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${checked ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                      {LETTERS[optionIndex] ?? optionIndex + 1}
                    </span>
                    <span className="pt-1 text-sm leading-relaxed text-on-surface">{option.text}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button className="btn-secondary" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>
              <Icon name="arrow_back" size={20} /> <span className="hidden sm:inline">Previous</span>
            </button>
            <span className="text-xs text-on-surface-variant">{index + 1} / {paper.questions.length}</span>
            {index === paper.questions.length - 1 ? (
              <button className="btn-primary" onClick={() => setConfirmOpen(true)}>
                Review &amp; submit <Icon name="done_all" size={20} />
              </button>
            ) : (
              <button className="btn-primary" onClick={() => setIndex((value) => Math.min(paper.questions.length - 1, value + 1))}>
                <span className="hidden sm:inline">Next</span> <Icon name="arrow_forward" size={20} />
              </button>
            )}
          </div>
        </div>

        <aside className="hidden md:block">
          <div className="sticky top-24 card p-4">
            <h2 className="text-base font-bold text-on-surface">Question map</h2>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {paper.questions.map((item, itemIndex) => {
                const isAnswered = (answers.get(item.id) ?? []).length > 0
                const isFlagged = review.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIndex(itemIndex)}
                    className={`flex aspect-square w-full items-center justify-center rounded-full font-label-md text-label-md font-bold transition-all hover:opacity-80 ${
                      itemIndex === index
                        ? 'progress-dot-current scale-110 ring-4 ring-primary-container/20'
                        : isFlagged
                          ? 'progress-dot-flagged'
                          : isAnswered
                            ? 'progress-dot-answered'
                            : 'progress-dot-unanswered'
                    }`}
                  >
                    {itemIndex + 1}
                  </button>
                )
              })}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-outline-variant/50 pt-3 text-center">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant">Unanswered</dt>
                <dd className="text-lg font-bold">{paper.questions.length - answered}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-on-surface-variant">Flagged</dt>
                <dd className="text-lg font-bold text-error">{review.size}</dd>
              </div>
            </dl>
            <button className="btn-secondary mt-4 w-full" onClick={() => setConfirmOpen(true)}>
              Submit exam
            </button>
          </div>
        </aside>
      </div>

      <Modal open={confirmOpen} title="Submit your exam?" onClose={() => setConfirmOpen(false)}>
        <p className="text-sm text-on-surface-variant">
          You have answered {answered} of {paper.questions.length} questions. Once submitted you cannot change your answers.
        </p>
        <div className="mt-5 flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setConfirmOpen(false)}>Keep working</button>
          <button className="btn-primary flex-1" onClick={() => void submit(false)}>Submit now</button>
        </div>
      </Modal>
    </main>
  )
}

function ResultScreen({ result, onExit }: { result: SubmitResult; onExit: () => void }) {
  const percent = Math.round(result.result.percentage)
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/30 text-on-primary-container">
          <Icon name="task_alt" filled size={36} />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-on-surface">Exam submitted</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{result.exam.title}</p>
        <div className="mt-6 rounded-2xl bg-surface-container-low p-5">
          <p className="text-4xl font-bold text-primary">{percent}%</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            {result.result.score} out of {result.result.maxScore} marks
          </p>
          <p className="mt-2 text-xs text-on-surface-variant">
            {result.result.answeredCount} answered · {result.result.unansweredCount} unanswered
          </p>
        </div>
        <button className="btn-primary mt-6 w-full" onClick={onExit}>Back to my exams</button>
        <p className="mt-3 text-xs text-on-surface-variant">Your result has been saved on the hall server. The invigilator will upload it to the school.</p>
      </div>
    </main>
  )
}

function formatCountdown(total: number): string {
  const safe = Math.max(0, total)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}
