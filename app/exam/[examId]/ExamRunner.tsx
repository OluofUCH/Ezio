'use client'

import Link from 'next/link'
import { useState } from 'react'
import { QuestionCard } from '@/components/exam/QuestionCard'
import { QuestionMap, QuestionMapLegend } from '@/components/exam/QuestionMap'
import { Alert } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { classLevelLabel, formatCountdown, formatPercent, subjectIcon } from '@/lib/client/format'
import { useExamSession } from '@/lib/client/useExamSession'

/** Below this the countdown turns red and pulses. Five minutes, matching the reference screen. */
const WARNING_SECONDS = 5 * 60

export function ExamRunner({ examId }: { examId: string }) {
  const exam = useExamSession(examId)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (exam.phase === 'starting') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingPanel message="Preparing your paper…" />
      </div>
    )
  }

  if (exam.phase === 'blocked' && exam.blocked) {
    return <BlockedScreen code={exam.blocked.code} message={exam.blocked.message} />
  }

  if (exam.phase === 'finished' && exam.outcome) {
    return (
      <ResultScreen
        automatic={exam.outcome.automatic}
        result={exam.outcome.result}
        examTitle={exam.paper?.exam.title ?? 'Your exam'}
      />
    )
  }

  const paper = exam.paper
  if (!paper) return null

  const current = exam.questions[exam.index]
  const critical = exam.seconds <= WARNING_SECONDS

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Minimal top bar. No navigation: this is a linear, transactional flow. */}
      <header className="glass-panel sticky top-0 z-40 flex flex-col items-center justify-between gap-4 px-margin-mobile py-4 md:flex-row md:px-margin-desktop">
        <div className="flex w-full items-center gap-4 md:w-auto">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/20 text-primary">
            <Icon name={subjectIcon(paper.exam.subject)} filled />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-headline-md text-headline-md font-bold text-on-surface">
              {paper.exam.title}
            </h1>
            <p className="truncate font-body-md text-body-md text-on-surface-variant">
              {paper.exam.subject} · {classLevelLabel(paper.exam.classLevel)}
            </p>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-6 md:w-auto md:justify-end">
          <div className="flex flex-col items-start md:items-end">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              Answered
            </span>
            <span className="font-headline-md text-headline-md font-semibold text-primary">
              {exam.progress.answeredCount}
              <span className="font-body-lg font-normal text-on-surface-variant"> / {exam.progress.total}</span>
            </span>
          </div>

          <div className="hidden h-10 w-px bg-outline-variant md:block" />

          <div
            className={`flex items-center gap-2 rounded-full border px-4 py-2 ${
              critical
                ? 'animate-pulse border-error/20 bg-error-container/50 shadow-[0_0_15px_rgba(186,26,26,0.2)]'
                : 'border-outline-variant bg-surface-container'
            }`}
            role="timer"
            aria-live="off"
          >
            <Icon name="timer" filled className={critical ? 'text-error' : 'text-primary'} />
            <span
              className={`tabular font-headline-md text-headline-md font-bold tracking-tight ${
                critical ? 'text-error' : 'text-on-surface'
              }`}
            >
              {formatCountdown(exam.seconds)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-container-max flex-1 flex-col gap-gutter p-margin-mobile md:flex-row md:p-margin-desktop">
        {/* Question column */}
        <div className="flex w-full flex-col gap-6 md:w-8/12">
          {exam.saveError ? (
            <Alert tone="warning" title="An answer may not have saved" onDismiss={exam.dismissSaveError}>
              {exam.saveError} Your answers are marked on the server, so please check this question
              and re-select if needed.
            </Alert>
          ) : null}

          {exam.submitError ? (
            <Alert tone="danger" title="Could not submit" onDismiss={exam.dismissSubmitError}>
              {exam.submitError}
            </Alert>
          ) : null}

          {current ? (
            <QuestionCard
              question={current}
              number={exam.index + 1}
              total={exam.questions.length}
              selected={exam.answers.get(current.id) ?? []}
              flagged={exam.review.has(current.id)}
              saving={exam.savingIds.has(current.id)}
              onSelect={(optionId) =>
                exam.select(current.id, optionId, current.type === 'MULTIPLE_CHOICE')
              }
              onToggleFlag={() => exam.toggleReview(current.id)}
            />
          ) : null}

          <div className="mt-auto flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => exam.setIndex(Math.max(0, exam.index - 1))}
              disabled={exam.index === 0}
              className="btn-secondary rounded-xl"
            >
              <Icon name="arrow_back" size={20} />
              <span className="hidden sm:inline">Previous</span>
            </button>

            <span className="font-label-md text-label-md text-on-surface-variant">
              {exam.index + 1} / {exam.questions.length}
            </span>

            {exam.index === exam.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="btn-primary rounded-xl px-8"
              >
                Review &amp; submit
                <Icon name="done_all" size={20} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => exam.setIndex(Math.min(exam.questions.length - 1, exam.index + 1))}
                className="btn-primary rounded-xl px-8"
              >
                <span className="hidden sm:inline">Next</span>
                <Icon name="arrow_forward" size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Map column */}
        <aside className="w-full md:w-4/12">
          <div className="flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface">Question map</h2>
            <div className="mt-3">
              <QuestionMapLegend />
            </div>

            <div className="custom-scrollbar mt-6 flex-1 overflow-y-auto pr-2 md:max-h-[calc(100vh-24rem)]">
              <QuestionMap
                questions={exam.questions}
                answers={exam.answers}
                review={exam.review}
                currentIndex={exam.index}
                onJump={exam.setIndex}
              />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-outline-variant pt-4">
              <div>
                <dt className="font-label-sm text-label-sm text-on-surface-variant">Unanswered</dt>
                <dd className="font-headline-md text-headline-md text-on-surface">
                  {exam.progress.unansweredCount}
                </dd>
              </div>
              <div>
                <dt className="font-label-sm text-label-sm text-on-surface-variant">Flagged</dt>
                <dd className="font-headline-md text-headline-md text-error">{exam.progress.reviewCount}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={exam.phase === 'submitting'}
              className="btn-danger mt-4 w-full rounded-xl py-4"
            >
              {exam.phase === 'submitting' ? <Spinner size={20} /> : <Icon name="done_all" size={20} />}
              {exam.phase === 'submitting' ? 'Submitting…' : 'Submit exam'}
            </button>
          </div>
        </aside>
      </main>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        busy={exam.phase === 'submitting'}
        title="Ready to submit?"
        icon="warning"
        iconTone="danger"
      >
        <p className="text-center font-body-md text-body-md text-on-surface-variant">
          You have answered{' '}
          <strong className="text-on-surface">
            {exam.progress.answeredCount} of {exam.progress.total}
          </strong>{' '}
          questions.
          {exam.progress.unansweredCount > 0 ? (
            <>
              {' '}
              <strong className="text-on-surface">
                {exam.progress.unansweredCount} unanswered
              </strong>{' '}
              {exam.progress.unansweredCount === 1 ? 'question' : 'questions'} will be marked zero.
            </>
          ) : null}
          {exam.progress.reviewCount > 0 ? (
            <>
              {' '}
              You still have{' '}
              <strong className="text-error">{exam.progress.reviewCount} flagged</strong> for review.
            </>
          ) : null}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={exam.phase === 'submitting'}
            className="btn-primary w-full rounded-xl py-3"
          >
            Return to exam
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmOpen(false)
              void exam.submit()
            }}
            disabled={exam.phase === 'submitting'}
            className="w-full rounded-xl border-2 border-error py-3 font-label-md text-label-md font-bold text-error transition-colors hover:bg-error-container disabled:opacity-50"
          >
            Yes, submit now
          </button>
        </div>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Terminal screens
 * ------------------------------------------------------------------ */

/**
 * `/start` refused. Each code maps to the specific precondition the server checked, so
 * the student is told what to do rather than just that something failed.
 */
function BlockedScreen({ code, message }: { code: string; message: string }) {
  const guidance: Record<string, { icon: string; title: string }> = {
    WRONG_CLASS_LEVEL: { icon: 'school', title: 'This exam is for another class' },
    EXAM_WINDOW_CLOSED: { icon: 'schedule', title: 'This exam is not open' },
    ATTEMPT_LIMIT_REACHED: { icon: 'replay', title: 'No attempts left' },
    EXAM_HAS_NO_QUESTIONS: { icon: 'help', title: 'This exam has no questions yet' },
    NOT_FOUND: { icon: 'search_off', title: 'Exam not found' },
    SESSION_EXPIRED: { icon: 'lock_clock', title: 'Your session expired' },
  }

  const detail = guidance[code] ?? { icon: 'error', title: 'Cannot start this exam' }

  return (
    <div className="flex min-h-screen items-center justify-center p-margin-mobile">
      <div className="card w-full max-w-lg p-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-error-container/40 text-error">
          <Icon name={detail.icon} size={32} />
        </div>
        <h1 className="font-headline-md text-headline-md font-bold text-on-surface">{detail.title}</h1>
        <p className="mt-3 font-body-md text-body-md text-on-surface-variant">{message}</p>
        <Link href="/student/exams" className="btn-primary mt-8">
          <Icon name="arrow_back" size={20} />
          Back to my exams
        </Link>
      </div>
    </div>
  )
}

function ResultScreen({
  automatic,
  result,
  examTitle,
}: {
  automatic: boolean
  result: {
    score: number
    maxScore: number
    percentage: number
    answeredCount: number
    totalQuestions: number
    unansweredCount: number
  }
  examTitle: string
}) {
  const passed = result.percentage >= 40

  return (
    <div className="flex min-h-screen items-center justify-center p-margin-mobile">
      <div className="card w-full max-w-xl p-8 text-center md:p-10">
        <div
          className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
            automatic
              ? 'bg-[#fef3c7] text-[#92400e]'
              : passed
                ? 'bg-primary-container/30 text-on-primary-container'
                : 'bg-error-container/50 text-error'
          }`}
        >
          <Icon name={automatic ? 'timer_off' : passed ? 'check_circle' : 'info'} size={40} filled />
        </div>

        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {automatic ? 'Time up — submitted automatically' : 'Exam submitted'}
        </h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">{examTitle}</p>

        <div className="my-8 rounded-xl bg-surface-container-low p-6">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Your score
          </p>
          <p className="mt-2 font-display-lg text-display-lg text-on-surface">
            {formatPercent(result.percentage)}
          </p>
          <p className="mt-1 font-body-lg text-body-lg text-on-surface-variant">
            {result.score} out of {result.maxScore} marks
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-4 text-left">
          <div className="rounded-lg bg-surface-container-low p-4">
            <dt className="font-label-sm text-label-sm text-on-surface-variant">Answered</dt>
            <dd className="mt-1 font-headline-md text-headline-md text-on-surface">
              {result.answeredCount}
            </dd>
          </div>
          <div className="rounded-lg bg-surface-container-low p-4">
            <dt className="font-label-sm text-label-sm text-on-surface-variant">Blank</dt>
            <dd className="mt-1 font-headline-md text-headline-md text-on-surface">
              {result.unansweredCount}
            </dd>
          </div>
          <div className="rounded-lg bg-surface-container-low p-4">
            <dt className="font-label-sm text-label-sm text-on-surface-variant">Total</dt>
            <dd className="mt-1 font-headline-md text-headline-md text-on-surface">
              {result.totalQuestions}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/student/results" className="btn-primary">
            <Icon name="assessment" size={20} />
            View all results
          </Link>
          <Link href="/student" className="btn-secondary">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
