'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { QuestionUpload } from '@/components/staff/QuestionUpload'
import { SessionMonitor } from '@/components/staff/SessionMonitor'
import { SchoolGate } from '@/components/staff/SchoolGate'
import { useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage } from '@/lib/client/api'
import {
  classLevelLabel,
  examModeLabel,
  formatDateTime,
  formatDuration,
  subjectIcon,
} from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { ExamDetail, PublishResult, QuestionList } from '@/lib/client/types'

type Tab = 'questions' | 'invigilate' | 'settings'

export function ExamManager({ examId }: { examId: string }) {
  return (
    <SchoolGate>
      <ManagerBody examId={examId} />
    </SchoolGate>
  )
}

const LETTERS = ['A', 'B', 'C', 'D'] as const

function ManagerBody({ examId }: { examId: string }) {
  const { withScope } = useScope()
  const [tab, setTab] = useState<Tab>('questions')

  const detail = useApi<ExamDetail>(withScope(`/api/exams/${examId}`))
  const questions = useApi<QuestionList>(withScope(`/api/exams/${examId}/questions`))

  const [publishing, setPublishing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)

  if (detail.loading) return <LoadingPanel message="Loading exam…" />

  if (detail.error && !detail.data) {
    return (
      <Alert tone="danger" title="Could not load this exam">
        {detail.error}
        <Link href="/staff/exams" className="mt-3 block font-label-md underline">
          Back to exams
        </Link>
      </Alert>
    )
  }

  const data = detail.data
  if (!data) return null

  const { exam, totalPoints, canPublish } = data
  const hasSittings = exam._count.examSessions > 0

  async function setPublished(isPublished: boolean) {
    setPublishing(true)
    setActionError(null)
    setNotice(null)

    try {
      const result = await api.post<PublishResult>(withScope(`/api/exams/${examId}/publish`), {
        isPublished,
      })
      setNotice(
        result.changed
          ? isPublished
            ? `Published. Visible to ${result.visibleTo ?? 'the target class'}.`
            : 'Un-published. Students can no longer start this exam; existing results are untouched.'
          : 'No change — the exam was already in that state.',
      )
      detail.refetch()
    } catch (err) {
      // The server refuses publishing with no questions, an inverted window, or a window
      // that already closed. Its message names which, so it is shown verbatim.
      setActionError(errorMessage(err))
    } finally {
      setPublishing(false)
      setConfirmUnpublish(false)
    }
  }

  async function deleteQuestion(questionId: string) {
    setActionError(null)
    try {
      await api.delete(withScope(`/api/questions/${questionId}`))
      questions.refetch()
      detail.refetch()
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'EXAM_HAS_SESSIONS') {
        setActionError(err.message)
        return
      }
      setActionError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Link
          href="/staff/exams"
          className="inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-on-surface"
        >
          <Icon name="arrow_back" size={18} />
          Back to exams
        </Link>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-container/20 text-primary">
              <Icon name={subjectIcon(exam.subject)} size={28} filled />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
                  {exam.title}
                </h1>
                <Badge tone={exam.isPublished ? 'success' : 'neutral'}>
                  {exam.isPublished ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                {exam.subject} · {classLevelLabel(exam.classLevel)} ·{' '}
                {formatDuration(exam.durationMins)} · {examModeLabel(exam.mode)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href={`/staff/exams/${examId}/results`} className="btn-secondary">
              <Icon name="assessment" size={20} />
              Results
            </Link>

            {exam.isPublished ? (
              <button
                type="button"
                onClick={() => setConfirmUnpublish(true)}
                disabled={publishing}
                className="btn-secondary"
              >
                <Icon name="visibility_off" size={20} />
                Un-publish
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setPublished(true)}
                disabled={publishing || !canPublish}
                title={canPublish ? undefined : 'Add at least one question first'}
                className="btn-primary"
              >
                {publishing ? <Spinner size={20} /> : <Icon name="publish" size={20} />}
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      </header>

      {notice ? (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      {actionError ? (
        <Alert tone="danger" title="That did not work" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      {!canPublish ? (
        <Alert tone="warning" title="This exam has no questions">
          Publishing is blocked until at least one question exists — a student starting an
          empty paper would score 0 out of 0.
        </Alert>
      ) : null}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Summary label="Questions" value={String(exam._count.questions)} icon="help" />
        <Summary label="Total marks" value={String(totalPoints)} icon="functions" />
        <Summary label="Sittings" value={String(exam._count.examSessions)} icon="how_to_reg" />
        <Summary
          label="Attempts allowed"
          value={String(exam.maxAttempts)}
          icon="replay"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-surface-container p-1" role="tablist">
        {(
          [
            { key: 'questions', label: 'Questions', icon: 'quiz' },
            { key: 'invigilate', label: 'Invigilate', icon: 'monitor' },
            { key: 'settings', label: 'Settings', icon: 'settings' },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={tab === option.key}
            onClick={() => setTab(option.key)}
            className={
              tab === option.key
                ? 'flex flex-1 items-center justify-center gap-2 rounded-md border-b-2 border-primary-container bg-white py-2 font-label-md text-label-md text-on-surface shadow-sm'
                : 'flex flex-1 items-center justify-center gap-2 rounded-md py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface'
            }
          >
            <Icon name={option.icon} size={18} />
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'questions' ? (
        <div className="space-y-6">
          <QuestionUpload
            examId={examId}
            existingCount={exam._count.questions}
            hasSittings={hasSittings}
            onImported={() => {
              questions.refetch()
              detail.refetch()
            }}
          />

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle p-6">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                Current paper
                {questions.data ? (
                  <span className="ml-2 font-body-md text-on-surface-variant">
                    ({questions.data.questions.length} questions · {questions.data.totalPoints} marks)
                  </span>
                ) : null}
              </h3>
              {questions.refreshing ? <Spinner size={18} className="text-primary" /> : null}
            </div>

            {questions.loading ? (
              <LoadingPanel message="Loading questions…" />
            ) : questions.data && questions.data.questions.length > 0 ? (
              <ol className="divide-y divide-border-subtle">
                {questions.data.questions.map((question, position) => (
                  <li key={question.id} className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                          Q{position + 1} · {question.type.replace(/_/g, ' ').toLowerCase()} ·{' '}
                          {question.points} {question.points === 1 ? 'mark' : 'marks'}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap font-body-lg text-body-lg text-on-surface">
                          {question.text}
                        </p>

                        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {question.options.map((option, index) => (
                            <li
                              key={option.id}
                              className={`flex items-start gap-2 rounded-lg border p-3 font-body-md text-body-md ${
                                option.isCorrect
                                  ? 'border-primary-container bg-primary-container/15 text-on-primary-container'
                                  : 'border-border-subtle text-on-surface-variant'
                              }`}
                            >
                              {/* Staff-only view: the authoring endpoint includes
                                  `isCorrect`, which the student paper select cannot. */}
                              <Icon
                                name={option.isCorrect ? 'check_circle' : 'radio_button_unchecked'}
                                size={18}
                                className="mt-0.5"
                              />
                              <span>
                                <strong>{LETTERS[index] ?? index + 1})</strong> {option.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => void deleteQuestion(question.id)}
                        disabled={hasSittings}
                        title={
                          hasSittings
                            ? 'Students have already sat this exam — deleting a question would orphan their answers.'
                            : 'Delete this question'
                        }
                        className="shrink-0 rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-error-container hover:text-error disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant"
                        aria-label={`Delete question ${position + 1}`}
                      >
                        <Icon name="delete" size={20} />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon="upload_file"
                title="No questions yet"
                description="Upload a filled-in .xlsx template above. You will see a row-by-row preview before anything is saved."
              />
            )}
          </section>
        </div>
      ) : null}

      {tab === 'invigilate' ? <SessionMonitor examId={examId} /> : null}

      {tab === 'settings' ? (
        <ExamSettings exam={exam} hasSittings={hasSittings} />
      ) : null}

      <Modal
        open={confirmUnpublish}
        onClose={() => setConfirmUnpublish(false)}
        busy={publishing}
        title="Un-publish this exam?"
        icon="visibility_off"
        iconTone="danger"
        description="Students who have not started it will no longer see it. Sessions already in progress and every recorded result are left untouched."
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmUnpublish(false)}
              disabled={publishing}
              className="btn-primary w-full"
            >
              Keep it published
            </button>
            <button
              type="button"
              onClick={() => void setPublished(false)}
              disabled={publishing}
              className="w-full rounded-lg border-2 border-error py-3 font-label-md text-label-md font-bold text-error transition-colors hover:bg-error-container disabled:opacity-50"
            >
              {publishing ? 'Working…' : 'Yes, un-publish'}
            </button>
          </>
        }
      />
    </div>
  )
}

function Summary({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate font-label-sm text-label-sm text-on-surface-variant">{label}</p>
        <p className="font-headline-md text-headline-md text-on-surface">{value}</p>
      </div>
    </div>
  )
}

/** Read-only settings view. Editing lands in the PATCH endpoint's frozen-field rules. */
function ExamSettings({
  exam,
  hasSittings,
}: {
  exam: ExamDetail['exam']
  hasSittings: boolean
}) {
  return (
    <section className="card p-6 md:p-8">
      <h3 className="font-headline-md text-headline-md text-on-surface">Configuration</h3>

      {hasSittings ? (
        <Alert tone="info" className="mt-4">
          Students have already sat this exam. Duration and class level are frozen — changing
          either would alter the conditions of attempts that are already graded.
        </Alert>
      ) : null}

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Row label="Class level" value={classLevelLabel(exam.classLevel)} />
        <Row label="Subject" value={exam.subject} />
        <Row label="Duration" value={formatDuration(exam.durationMins)} />
        <Row label="Delivery mode" value={examModeLabel(exam.mode)} />
        <Row label="Attempts allowed" value={String(exam.maxAttempts)} />
        <Row
          label="Shuffling"
          value={
            exam.shuffleQuestions && exam.shuffleOptions
              ? 'Questions and options'
              : exam.shuffleQuestions
                ? 'Questions only'
                : exam.shuffleOptions
                  ? 'Options only'
                  : 'Off'
          }
        />
        <Row label="Opens" value={exam.startWindow ? formatDateTime(exam.startWindow) : 'When published'} />
        <Row label="Closes" value={exam.endWindow ? formatDateTime(exam.endWindow) : 'No end date'} />
        <Row label="Created by" value={exam.createdBy?.fullName ?? '—'} />
        <Row label="Last updated" value={formatDateTime(exam.updatedAt)} />
      </dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border-subtle pb-3">
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-body-md text-body-md text-on-surface">{value}</dd>
    </div>
  )
}
