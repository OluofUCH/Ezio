'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiClientError, api, errorMessage } from '@/lib/client/api'
import type {
  SessionHeartbeat,
  StartExamResult,
  SubmitExamResult,
  SubmitResultPayload,
} from '@/lib/client/types'

/**
 * THE EXAM RUNNER'S STATE MACHINE
 * ===============================
 *
 * Holds everything the exam screen needs: the paper, the student's selections, the
 * countdown, autosave, the malpractice log, and submission.
 *
 * The governing principle, from PRD §4.2, is that **the browser's clock is cosmetic**.
 * The countdown here exists so a student can see time passing; it is never what ends the
 * exam. Every server route runs `requireOpenSession` first, so a tampered or frozen timer
 * simply means the next request auto-submits the session. This hook therefore treats the
 * server's `secondsRemaining` as authoritative on every response it receives and
 * re-synchronises to it, rather than trusting its own tick count.
 */

type Phase =
  /** Calling /start — it either creates a session or resumes an open one. */
  | 'starting'
  /** /start refused: wrong class, closed window, no attempts left, no questions. */
  | 'blocked'
  | 'active'
  | 'submitting'
  | 'finished'

type FlagType =
  | 'TAB_BLUR'
  | 'WINDOW_BLUR'
  | 'FULLSCREEN_EXIT'
  | 'COPY_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'DEVTOOLS_OPEN'

export type FinishedOutcome = {
  result: SubmitResultPayload
  /** True when the clock ran out rather than the student pressing Submit. */
  automatic: boolean
}

/** Debounce per question: a student toggling multi-select options sends one write, not five. */
const SAVE_DEBOUNCE_MS = 350

/** Server re-sync cadence. Frequent enough to catch drift, sparse enough for a full hall. */
const HEARTBEAT_MS = 25_000

/** Malpractice events are batched — a flaky touchscreen can fire blur handlers in bursts. */
const FLAG_FLUSH_MS = 5_000
const FLAG_BATCH_MAX = 50

/** One blur is one event; a window rapidly losing and regaining focus is still one. */
const FLAG_THROTTLE_MS = 2_000

export function useExamSession(examId: string) {
  const [phase, setPhase] = useState<Phase>('starting')
  const [paper, setPaper] = useState<StartExamResult | null>(null)
  const [blocked, setBlocked] = useState<{ code: string; message: string } | null>(null)
  const [outcome, setOutcome] = useState<FinishedOutcome | null>(null)

  const [answers, setAnswers] = useState<Map<string, string[]>>(new Map())
  /** A student's own "come back to this" marks. Local only — see the note in `toggleReview`. */
  const [review, setReview] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [seconds, setSeconds] = useState(0)

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const sessionId = paper?.session.id ?? null

  /* ---------------------------------------------------------------- *
   * Refs — values the timers and handlers need without re-subscribing
   * ---------------------------------------------------------------- */

  const sessionIdRef = useRef<string | null>(null)
  sessionIdRef.current = sessionId

  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingFlags = useRef<FlagType[]>([])
  const lastFlagAt = useRef<Map<FlagType, number>>(new Map())

  /** Guards the whole finishing path so two triggers cannot both bank a result. */
  const finishing = useRef(false)

  const finish = useCallback((result: SubmitResultPayload, automatic: boolean) => {
    if (finishing.current) return
    finishing.current = true

    // Cancel anything still queued: a debounced save landing after submission would
    // be refused by the server anyway, and the error would confuse the result screen.
    for (const timer of saveTimers.current.values()) clearTimeout(timer)
    saveTimers.current.clear()

    setOutcome({ result, automatic })
    setSeconds(0)
    setPhase('finished')
  }, [])

  /* ---------------------------------------------------------------- *
   * Start / resume
   * ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        /**
         * POST rather than a GET of some "paper" resource: this endpoint is the gate that
         * checks class level, window, and attempt limit, and it either creates a session
         * or resumes an open one. Calling it on mount is safe and idempotent — a refresh
         * mid-exam lands back in the same session with saved answers restored.
         */
        const data = await api.post<StartExamResult>(`/api/student/exams/${examId}/start`)
        if (cancelled) return

        setPaper(data)
        setSeconds(data.session.secondsRemaining)
        setAnswers(
          new Map(data.savedAnswers.map((entry) => [entry.questionId, entry.selectedOptionIds])),
        )

        // Resuming: drop the student on the first unanswered question rather than back at
        // question 1, which is where they were most likely working.
        if (data.session.resumed) {
          const answered = new Set(
            data.savedAnswers.filter((a) => a.selectedOptionIds.length > 0).map((a) => a.questionId),
          )
          const firstUnanswered = data.questions.findIndex((q) => !answered.has(q.id))
          setIndex(firstUnanswered === -1 ? 0 : firstUnanswered)
        }

        setPhase('active')
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiClientError) {
          setBlocked({ code: err.code, message: err.message })
        } else {
          setBlocked({ code: 'UNKNOWN', message: errorMessage(err) })
        }
        setPhase('blocked')
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [examId])

  /* ---------------------------------------------------------------- *
   * Countdown + heartbeat
   * ---------------------------------------------------------------- */

  const heartbeat = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id || finishing.current) return

    try {
      const data = await api.get<SessionHeartbeat>(`/api/student/sessions/${id}`)

      // The poll that discovers the expiry is the one that closes and grades the session.
      if (data.autoSubmitted) {
        finish(data.autoSubmitted, true)
        return
      }

      if (data.session.status !== 'IN_PROGRESS') {
        // Closed by something else — the staff sweep, or another tab submitting. The
        // heartbeat carries the banked score but not the full breakdown, so the missing
        // counts come from the session's own progress figures.
        finish(
          {
            score: data.result?.score ?? 0,
            maxScore: data.result?.maxScore ?? 0,
            percentage:
              data.result?.score !== null &&
              data.result?.score !== undefined &&
              data.result?.maxScore
                ? Math.round((data.result.score / data.result.maxScore) * 10000) / 100
                : 0,
            answeredCount: data.progress.answeredCount,
            totalQuestions: data.progress.totalQuestions,
            unansweredCount: data.progress.unansweredCount,
          },
          true,
        )
        return
      }

      // Authoritative. Corrects a tab that was throttled or suspended by a phone.
      setSeconds(data.session.secondsRemaining)
    } catch {
      // Swallowed on purpose. A dropped heartbeat is a network blip, not an exam event —
      // showing an error here would alarm a student mid-paper for nothing, and the
      // server-side deadline check means nothing is lost by the miss.
    }
  }, [finish])

  useEffect(() => {
    if (phase !== 'active') return

    const tick = setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          // Hitting zero locally only *asks* the server to confirm; it never ends the
          // exam by itself. `heartbeat` triggers the server-side auto-submit and returns
          // the graded result.
          void heartbeat()
          return 0
        }
        return current - 1
      })
    }, 1000)

    const sync = setInterval(() => void heartbeat(), HEARTBEAT_MS)

    return () => {
      clearInterval(tick)
      clearInterval(sync)
    }
  }, [phase, heartbeat])

  /**
   * Re-sync the moment the tab becomes visible again. A backgrounded tab has its timers
   * throttled to once a minute or stopped entirely, so a student returning after ten
   * minutes away would otherwise see a countdown that is minutes ahead of the server's.
   */
  useEffect(() => {
    if (phase !== 'active') return

    const onVisible = () => {
      if (document.visibilityState === 'visible') void heartbeat()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [phase, heartbeat])

  /* ---------------------------------------------------------------- *
   * Malpractice log (PRD §4.4 — recorded, never auto-penalised)
   * ---------------------------------------------------------------- */

  const recordFlag = useCallback((type: FlagType) => {
    if (phaseRef.current !== 'active') return

    const now = Date.now()
    const previous = lastFlagAt.current.get(type) ?? 0
    if (now - previous < FLAG_THROTTLE_MS) return
    lastFlagAt.current.set(type, now)

    // Bounded client-side too: the endpoint accepts at most 50 events per call, and
    // dropping the excess here is better than a rejected batch losing all of them.
    if (pendingFlags.current.length < FLAG_BATCH_MAX) pendingFlags.current.push(type)
  }, [])

  const flushFlags = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id || pendingFlags.current.length === 0) return

    const batch = pendingFlags.current.splice(0, FLAG_BATCH_MAX)
    try {
      await api.post(`/api/student/sessions/${id}/flags`, {
        events: batch.map((type) => ({ type })),
      })
    } catch {
      // Not retried and not surfaced. These are advisory signals whose value is the
      // pattern, not the exact tally; failing an exam action over a lost blur event
      // would be a far worse outcome than an incomplete log.
    }
  }, [])

  useEffect(() => {
    if (phase !== 'active') return

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') recordFlag('TAB_BLUR')
    }
    const onBlur = () => recordFlag('WINDOW_BLUR')
    const onCopy = () => recordFlag('COPY_ATTEMPT')
    const onPaste = () => recordFlag('PASTE_ATTEMPT')

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)

    const flushTimer = setInterval(() => void flushFlags(), FLAG_FLUSH_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
      clearInterval(flushTimer)
    }
  }, [phase, recordFlag, flushFlags])

  /** Warn on accidental close/refresh while a paper is open. */
  useEffect(() => {
    if (phase !== 'active') return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Browsers show their own generic wording; returning a value is what triggers it.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase])

  /* ---------------------------------------------------------------- *
   * Answering
   * ---------------------------------------------------------------- */

  const persist = useCallback(
    async (questionId: string, selectedOptionIds: string[]) => {
      const id = sessionIdRef.current
      if (!id) return

      setSavingIds((current) => new Set(current).add(questionId))

      try {
        await api.put(`/api/student/sessions/${id}/answers/${questionId}`, { selectedOptionIds })
        setSaveError(null)
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'SESSION_EXPIRED_AUTOSUBMITTED') {
          // The server auto-submitted as it refused this write, and attached the graded
          // result to the error (see `requireOpenSession` in lib/grading.ts).
          const result = err.details as SubmitResultPayload | undefined
          if (result && typeof result.score === 'number') {
            finish(result, true)
            return
          }
          void heartbeat()
          return
        }

        if (err instanceof ApiClientError && err.code === 'SESSION_ALREADY_CLOSED') {
          void heartbeat()
          return
        }

        setSaveError(errorMessage(err))
      } finally {
        setSavingIds((current) => {
          const next = new Set(current)
          next.delete(questionId)
          return next
        })
      }
    },
    [finish, heartbeat],
  )

  /**
   * Record a selection.
   *
   * Local state updates immediately and the write follows, so the UI never waits on the
   * network — important on a school LAN where a round trip can be slow. The server is
   * still the only thing that gets graded, which is why a failed save raises a visible
   * warning rather than silently diverging from what the student sees.
   */
  const select = useCallback(
    (questionId: string, optionId: string, multiple: boolean) => {
      if (phaseRef.current !== 'active') return

      setAnswers((current) => {
        const existing = current.get(questionId) ?? []

        const next = multiple
          ? existing.includes(optionId)
            ? existing.filter((id) => id !== optionId)
            : [...existing, optionId]
          : // Re-tapping the chosen option clears it. An empty array is a meaningful
            // payload — `saveAnswerSchema` treats it as "unanswer this question".
            existing.length === 1 && existing[0] === optionId
            ? []
            : [optionId]

        const updated = new Map(current)
        updated.set(questionId, next)

        const timers = saveTimers.current
        const queued = timers.get(questionId)
        if (queued) clearTimeout(queued)
        timers.set(
          questionId,
          setTimeout(() => {
            timers.delete(questionId)
            void persist(questionId, next)
          }, SAVE_DEBOUNCE_MS),
        )

        return updated
      })
    },
    [persist],
  )

  /**
   * Toggle a review mark.
   *
   * Kept in the browser rather than sent to the server: there is no endpoint for it, and
   * that is the right design. `securityFlags` is an invigilator's malpractice log, and
   * writing a student's private "check this later" bookmark into the same column would
   * make a teacher's flagged-session count meaningless. The cost is that marks are lost
   * if the tab is closed — acceptable for a scratch note, unlike an answer.
   */
  const toggleReview = useCallback((questionId: string) => {
    setReview((current) => {
      const next = new Set(current)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
  }, [])

  /* ---------------------------------------------------------------- *
   * Submit
   * ---------------------------------------------------------------- */

  const submit = useCallback(async () => {
    const id = sessionIdRef.current
    if (!id || finishing.current) return

    setPhase('submitting')
    setSubmitError(null)

    // Land every debounced answer before handing in, so a selection made a moment before
    // pressing Submit is not left behind by its own timer.
    const timers = saveTimers.current
    const flushes: Promise<void>[] = []
    for (const [questionId, timer] of timers) {
      clearTimeout(timer)
      timers.delete(questionId)
      flushes.push(persist(questionId, answers.get(questionId) ?? []))
    }
    if (flushes.length > 0) await Promise.allSettled(flushes)

    // Same for the malpractice batch — the session is about to close and the endpoint
    // refuses writes on a closed session.
    await flushFlags()

    if (finishing.current) return

    try {
      const data = await api.post<SubmitExamResult>(`/api/student/sessions/${id}/submit`)
      finish(data.result, false)
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'SESSION_EXPIRED_AUTOSUBMITTED') {
        const result = err.details as SubmitResultPayload | undefined
        if (result && typeof result.score === 'number') {
          finish(result, true)
          return
        }
      }

      if (err instanceof ApiClientError && err.code === 'SESSION_ALREADY_CLOSED') {
        // Already handed in — another tab, or the staff sweep. Read the outcome.
        await heartbeat()
        return
      }

      setSubmitError(errorMessage(err))
      setPhase('active')
    }
  }, [answers, persist, flushFlags, finish, heartbeat])

  /* ---------------------------------------------------------------- *
   * Derived
   * ---------------------------------------------------------------- */

  const questions = paper?.questions ?? []

  const progress = useMemo(() => {
    const answered = questions.filter((question) => (answers.get(question.id) ?? []).length > 0)
    return {
      answeredCount: answered.length,
      total: questions.length,
      unansweredCount: questions.length - answered.length,
      reviewCount: review.size,
    }
  }, [questions, answers, review])

  return {
    phase,
    paper,
    blocked,
    outcome,
    questions,
    answers,
    review,
    index,
    seconds,
    progress,
    savingIds,
    saveError,
    submitError,
    setIndex,
    select,
    toggleReview,
    submit,
    dismissSaveError: () => setSaveError(null),
    dismissSubmitError: () => setSubmitError(null),
  }
}
