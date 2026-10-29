'use client'

import Link from 'next/link'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel } from '@/components/ui/Spinner'
import { Donut, ProgressBar, StatCard } from '@/components/ui/Stats'
import { ExamCard } from '@/components/student/ExamCard'
import {
  classLevelLabel,
  formatCountdown,
  formatDate,
  formatPercent,
  scoreBand,
} from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { StudentExamList, StudentResults } from '@/lib/client/types'

export function StudentDashboard() {
  const exams = useApi<StudentExamList>('/api/student/exams')
  const results = useApi<StudentResults>('/api/student/results?pageSize=5')

  if (exams.loading) return <LoadingPanel message="Loading your exams…" />

  if (exams.error && !exams.data) {
    return (
      <Alert tone="danger" title="Could not load your dashboard">
        {exams.error}
        <button type="button" onClick={exams.refetch} className="mt-3 block font-label-md underline">
          Try again
        </button>
      </Alert>
    )
  }

  const data = exams.data
  if (!data) return null

  const firstName = data.student.fullName.trim().split(/\s+/)[0] ?? data.student.fullName
  const openNow = data.exams.filter((exam) => exam.canStart || exam.canResume)
  const active = data.exams.find((exam) => exam.activeSession !== null)
  const upcoming = data.exams.filter((exam) => exam.windowState === 'NOT_YET_OPEN')

  const graded = results.data?.results.filter((r) => r.percentage !== null) ?? []
  const average =
    graded.length > 0
      ? graded.reduce((sum, r) => sum + (r.percentage ?? 0), 0) / graded.length
      : null

  const completed = data.exams.reduce((sum, exam) => sum + exam.attemptsUsed, 0)
  const totalPublished = data.exams.length

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-xl border border-primary-container/25 bg-primary-container/10 p-8">
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="mb-2 text-sm font-semibold text-primary">CBT overview</p>
            <h1 className="font-display-lg text-headline-lg text-on-background md:text-display-lg">
              Hello, <span className="text-on-primary-container">{firstName}</span>
            </h1>
            <p className="mt-2 font-body-lg text-body-lg text-on-surface-variant">
              {openNow.length > 0 ? (
                <>
                  You have{' '}
                  <strong className="text-on-primary-container">{openNow.length}</strong>{' '}
                  {openNow.length === 1 ? 'exam' : 'exams'} you can take right now.
                </>
              ) : upcoming.length > 0 ? (
                <>
                  Nothing to take right now — {upcoming.length}{' '}
                  {upcoming.length === 1 ? 'exam is' : 'exams are'} scheduled.
                </>
              ) : (
                <>No exams have been published for {classLevelLabel(data.student.classLevel)} yet.</>
              )}
            </p>
          </div>

          <Badge tone="primary" icon="school" className="shrink-0">
            {classLevelLabel(data.student.classLevel)}
          </Badge>
        </div>

        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary-container/25 blur-3xl"
          aria-hidden
        />
      </section>

      {/* An exam already running takes priority over everything else on the page. */}
      {active && active.activeSession ? (
        <Alert tone="warning" title="You have an exam in progress">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p>
              {active.title} — <span className="tabular font-bold">
                {formatCountdown(active.activeSession.secondsRemaining)}
              </span>{' '}
              remaining. Your answers were saved as you went.
            </p>
            <Link href={`/exam/${active.id}`} className="btn-primary shrink-0">
              <Icon name="play_arrow" size={20} />
              Resume now
            </Link>
          </div>
        </Alert>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-gutter md:grid-cols-3">
        <StatCard
          label="Average score"
          value={average === null ? '—' : formatPercent(average)}
          icon="trending_up"
          detail={graded.length > 0 ? `last ${graded.length}` : 'no results yet'}
        />

        <StatCard
          label="Attempts completed"
          value={completed}
          icon="task_alt"
          detail={`of ${totalPublished} published`}
        >
          <ProgressBar value={completed} max={Math.max(totalPublished, 1)} />
        </StatCard>

        <div className="card flex flex-col items-center justify-center gap-2 p-6">
          <h3 className="self-start font-headline-md text-headline-md text-on-surface">Progress</h3>
          <Donut
            percent={totalPublished > 0 ? (completed / totalPublished) * 100 : 0}
            label={`${totalPublished > 0 ? Math.round((completed / totalPublished) * 100) : 0}%`}
            caption="done"
            size={116}
          />
        </div>
      </div>

      {/* Available exams */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">Available exams</h2>
          <Link
            href="/student/exams"
            className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:underline"
          >
            View all
          </Link>
        </div>

        {data.exams.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="quiz"
              title="No exams published yet"
              description={`When your teacher publishes an exam for ${classLevelLabel(
                data.student.classLevel,
              )}, it will appear here.`}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
            {/* Open and resumable first — the rest live on the full list page. */}
            {[...data.exams]
              .sort((a, b) => Number(b.canStart || b.canResume) - Number(a.canStart || a.canResume))
              .slice(0, 4)
              .map((exam) => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
          </div>
        )}
      </section>

      {/* Recent results */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">Recent results</h2>
          <Link
            href="/student/results"
            className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface hover:underline"
          >
            View all
          </Link>
        </div>

        <div className="card overflow-hidden">
          {results.loading ? (
            <LoadingPanel message="Loading results…" />
          ) : results.data && results.data.results.length > 0 ? (
            <ul className="divide-y divide-border-subtle">
              {results.data.results.map((result) => {
                const band = scoreBand(result.percentage)
                return (
                  <li key={result.sessionId} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-label-md text-label-md font-bold text-on-surface">
                        {result.exam.title}
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        {result.exam.subject} · {formatDate(result.submittedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {result.score ?? '—'}/{result.maxScore ?? '—'}
                      </span>
                      <Badge
                        tone={
                          band === 'excellent' || band === 'good'
                            ? 'success'
                            : band === 'pass'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {formatPercent(result.percentage)}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              icon="assessment"
              title="No results yet"
              description="Once you submit an exam, your score appears here immediately."
            />
          )}
        </div>
      </section>
    </div>
  )
}
