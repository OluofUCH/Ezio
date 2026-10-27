'use client'

import { useState } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel } from '@/components/ui/Spinner'
import { StatCard } from '@/components/ui/Stats'
import {
  classLevelLabel,
  formatDateTime,
  formatDuration,
  formatPercent,
  scoreBand,
  sessionStatusLabel,
  subjectIcon,
} from '@/lib/client/format'
import { query } from '@/lib/client/api'
import { useApi } from '@/lib/client/useApi'
import type { StudentResults } from '@/lib/client/types'

const PAGE_SIZE = 20

export function StudentResultsList() {
  const [page, setPage] = useState(1)
  const { data, error, loading, refetch } = useApi<StudentResults>(
    `/api/student/results${query({ page, pageSize: PAGE_SIZE })}`,
  )

  if (loading) return <LoadingPanel message="Loading your results…" />

  if (error && !data) {
    return (
      <Alert tone="danger" title="Could not load your results">
        {error}
        <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
          Try again
        </button>
      </Alert>
    )
  }

  if (!data) return null

  const graded = data.results.filter((result) => result.percentage !== null)
  const average =
    graded.length > 0
      ? graded.reduce((sum, result) => sum + (result.percentage ?? 0), 0) / graded.length
      : null
  const best = graded.reduce<number | null>(
    (top, result) => (top === null || (result.percentage ?? 0) > top ? (result.percentage ?? 0) : top),
    null,
  )
  const passed = graded.filter((result) => (result.percentage ?? 0) >= 40).length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          My Results
        </h1>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Every exam you have submitted, scored the moment you handed it in.
        </p>
      </header>

      {data.results.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="assessment"
            title="No results yet"
            description="Once you submit an exam, your score appears here immediately."
          />
        </div>
      ) : (
        <>
          {/* Stats reflect this page of results, which is stated so a paginated view
              cannot be misread as an all-time average. */}
          <div className="grid grid-cols-1 gap-gutter sm:grid-cols-3">
            <StatCard
              label={data.meta.totalPages > 1 ? 'Average (this page)' : 'Average score'}
              value={average === null ? '—' : formatPercent(average)}
              icon="trending_up"
              detail={`${graded.length} graded`}
            />
            <StatCard label="Best score" value={best === null ? '—' : formatPercent(best)} icon="star" tone="info" />
            <StatCard
              label="Passed"
              value={`${passed}/${graded.length}`}
              icon="task_alt"
              detail="40% and above"
            />
          </div>

          <div className="card overflow-hidden">
            {/* Table on desktop; the same rows become stacked cards on mobile, since a
                5-column table cannot be read on a phone without horizontal scrolling. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-container-low font-label-sm text-label-sm uppercase text-on-surface-variant">
                    <th className="p-4 font-semibold">Exam</th>
                    <th className="p-4 font-semibold">Submitted</th>
                    <th className="p-4 font-semibold">Score</th>
                    <th className="p-4 font-semibold">Percentage</th>
                    <th className="p-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {data.results.map((result) => {
                    const band = scoreBand(result.percentage)
                    return (
                      <tr key={result.sessionId} className="transition-colors hover:bg-surface-container-low/50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
                              <Icon name={subjectIcon(result.exam.subject)} size={20} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-label-md text-label-md font-bold text-on-surface">
                                {result.exam.title}
                              </p>
                              <p className="font-label-sm text-label-sm text-on-surface-variant">
                                {result.exam.subject} · {classLevelLabel(result.exam.classLevel)} ·{' '}
                                {formatDuration(result.exam.durationMins)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                          {formatDateTime(result.submittedAt)}
                        </td>
                        <td className="p-4 font-label-md text-label-md text-on-surface">
                          {result.score ?? '—'} / {result.maxScore ?? '—'}
                        </td>
                        <td className="p-4">
                          <ScoreChip band={band} percentage={result.percentage} />
                        </td>
                        <td className="p-4">
                          <Badge
                            tone={result.status === 'FLAGGED' ? 'danger' : 'neutral'}
                            icon={
                              result.status === 'AUTO_SUBMITTED'
                                ? 'timer_off'
                                : result.status === 'FLAGGED'
                                  ? 'flag'
                                  : 'check_circle'
                            }
                          >
                            {sessionStatusLabel(result.status)}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border-subtle md:hidden">
              {data.results.map((result) => (
                <li key={result.sessionId} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-label-md text-label-md font-bold text-on-surface">
                        {result.exam.title}
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        {result.exam.subject} · {formatDateTime(result.submittedAt)}
                      </p>
                    </div>
                    <ScoreChip band={scoreBand(result.percentage)} percentage={result.percentage} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {result.score ?? '—'} / {result.maxScore ?? '—'} marks
                    </span>
                    <Badge tone={result.status === 'FLAGGED' ? 'danger' : 'neutral'}>
                      {sessionStatusLabel(result.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>

            {data.meta.totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-border-subtle p-4">
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} results
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="rounded border border-outline-variant px-3 py-1 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-variant disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= data.meta.totalPages}
                    onClick={() => setPage((value) => value + 1)}
                    className="rounded border border-outline-variant px-3 py-1 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-variant disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

function ScoreChip({
  band,
  percentage,
}: {
  band: ReturnType<typeof scoreBand>
  percentage: number | null
}) {
  const tones = {
    excellent: 'bg-primary-container text-on-primary-fixed',
    good: 'bg-primary-container/30 text-on-primary-container',
    pass: 'bg-[#fef3c7] text-[#92400e]',
    fail: 'bg-error-container text-on-error-container',
    none: 'bg-surface-variant text-on-surface-variant',
  } as const

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-3 py-1 font-label-md text-label-md font-bold ${tones[band]}`}
    >
      {formatPercent(percentage)}
    </span>
  )
}
