'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { BarChart, type Bar } from '@/components/ui/BarChart'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel } from '@/components/ui/Spinner'
import { ProgressBar } from '@/components/ui/Stats'
import { SchoolGate } from '@/components/staff/SchoolGate'
import { useScope } from '@/components/staff/ScopeProvider'
import { query } from '@/lib/client/api'
import {
  classLevelLabel,
  formatDateTime,
  formatPercent,
  sessionStatusLabel,
} from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { ExamSessionList, ExamSessionRow } from '@/lib/client/types'

export function ExamResults({ examId }: { examId: string }) {
  return (
    <SchoolGate>
      <ResultsBody examId={examId} />
    </SchoolGate>
  )
}

/** WAEC-style bands, which is how a Nigerian secondary school reports a paper. */
const GRADES = [
  { key: 'A', label: 'Distinction', min: 75, tone: 'success' as const, icon: 'workspace_premium' },
  { key: 'B', label: 'Credit', min: 60, tone: 'success' as const, icon: 'thumb_up' },
  { key: 'C', label: 'Pass', min: 40, tone: 'warning' as const, icon: 'check' },
  { key: 'F', label: 'Fail', min: 0, tone: 'danger' as const, icon: 'priority_high' },
]

function ResultsBody({ examId }: { examId: string }) {
  const { withScope } = useScope()
  const [search, setSearch] = useState('')

  // Every session in one call: the analytics below are computed across the whole cohort,
  // so paginating would make the distribution a distribution of one page.
  const { data, error, loading, refetch } = useApi<ExamSessionList>(
    withScope(`/api/exams/${examId}/sessions${query({ pageSize: 200 })}`),
  )

  const analytics = useMemo(() => {
    const sessions = data?.sessions ?? []
    const graded = sessions.filter(
      (session): session is ExamSessionRow & { percentage: number } => session.percentage !== null,
    )

    const distribution: Bar[] = [
      { label: '0–20', value: 0 },
      { label: '21–40', value: 0 },
      { label: '41–60', value: 0 },
      { label: '61–80', value: 0 },
      { label: '81–100', value: 0 },
    ]

    for (const session of graded) {
      const bucket =
        session.percentage <= 20 ? 0 : session.percentage <= 40 ? 1 : session.percentage <= 60 ? 2 : session.percentage <= 80 ? 3 : 4
      const bar = distribution[bucket]
      if (bar) bar.value += 1
    }

    const average =
      graded.length > 0 ? graded.reduce((sum, s) => sum + s.percentage, 0) / graded.length : null

    const sorted = [...graded].sort((a, b) => a.percentage - b.percentage)
    const middle = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]?.percentage ?? null : null

    const passed = graded.filter((s) => s.percentage >= 40).length

    const grades = GRADES.map((grade, position) => {
      // Bands are exclusive upwards: the previous (higher) band's floor is this one's cap.
      const upper = position === 0 ? Number.POSITIVE_INFINITY : (GRADES[position - 1]?.min ?? 100)
      const count = graded.filter((s) => s.percentage >= grade.min && s.percentage < upper).length
      return { ...grade, count }
    })

    return {
      sessions,
      graded,
      distribution,
      average,
      median: middle,
      passed,
      passRate: graded.length > 0 ? (passed / graded.length) * 100 : null,
      highest: graded.length > 0 ? Math.max(...graded.map((s) => s.percentage)) : null,
      lowest: graded.length > 0 ? Math.min(...graded.map((s) => s.percentage)) : null,
      grades,
      inProgress: sessions.filter((s) => s.status === 'IN_PROGRESS').length,
      flagged: sessions.filter((s) => s.securityFlagCount > 0).length,
    }
  }, [data])

  if (loading) return <LoadingPanel message="Crunching results…" />

  if (error && !data) {
    return (
      <Alert tone="danger" title="Could not load results">
        {error}
        <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
          Try again
        </button>
      </Alert>
    )
  }

  if (!data) return null

  const { exam } = data
  const term = search.trim().toLowerCase()
  const visible = analytics.sessions.filter(
    (session) =>
      term === '' ||
      session.student.fullName.toLowerCase().includes(term) ||
      session.student.regNumber.toLowerCase().includes(term),
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Link
            href={`/staff/exams/${examId}`}
            className="mb-3 inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-on-surface"
          >
            <Icon name="arrow_back" size={18} />
            Back to exam
          </Link>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Results &amp; analytics
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {exam.title} · {exam.subject} · {classLevelLabel(exam.classLevel)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => exportCsv(exam.title, analytics.sessions)}
          disabled={analytics.sessions.length === 0}
          className="btn-primary shrink-0"
        >
          <Icon name="download" size={20} />
          Export CSV
        </button>
      </header>

      {analytics.sessions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="assessment"
            title="No sittings yet"
            description={
              exam.isPublished
                ? 'Results appear here as students submit, and when a hall server syncs its offline sessions up.'
                : 'This exam is not published yet, so no student can have sat it.'
            }
          />
        </div>
      ) : (
        <>
          {analytics.inProgress > 0 ? (
            <Alert tone="info" title={`${analytics.inProgress} student${analytics.inProgress === 1 ? ' is' : 's are'} still writing`}>
              The figures below cover submitted papers only, so they will move as the rest come
              in.
            </Alert>
          ) : null}

          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Hero label="Average" value={formatPercent(analytics.average)} />
            <Hero label="Pass rate" value={formatPercent(analytics.passRate)} sub="40% and above" />
            <Hero label="Highest" value={formatPercent(analytics.highest)} />
            <Hero
              label="Submitted"
              value={String(analytics.graded.length)}
              sub={`of ${analytics.sessions.length} sittings`}
            />
          </div>

          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
            {/* Distribution */}
            <section className="card p-6 lg:col-span-2 md:p-8">
              <div className="mb-6">
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  Score distribution
                </h2>
                <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                  Number of students in each score band. Median {formatPercent(analytics.median)}.
                </p>
              </div>

              <BarChart
                bars={analytics.distribution}
                valueSuffix="%"
                emptyMessage="No submitted papers to plot yet."
              />
            </section>

            {/* Grade breakdown — status semantics, always with an icon and a label so the
                band is never carried by colour alone. */}
            <section className="card flex flex-col p-6 md:p-8">
              <h2 className="mb-6 font-headline-md text-headline-md text-on-surface">
                Grade breakdown
              </h2>

              <div className="flex-1 space-y-5">
                {analytics.grades.map((grade) => {
                  const share =
                    analytics.graded.length > 0 ? (grade.count / analytics.graded.length) * 100 : 0

                  return (
                    <div key={grade.key}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant">
                          <Icon
                            name={grade.icon}
                            size={16}
                            className={
                              grade.tone === 'danger'
                                ? 'text-error'
                                : grade.tone === 'warning'
                                  ? 'text-[#92400e]'
                                  : 'text-on-primary-container'
                            }
                          />
                          {grade.label}
                        </span>
                        <span className="font-label-md text-label-md font-bold text-on-surface">
                          {grade.count} · {Math.round(share)}%
                        </span>
                      </div>
                      <ProgressBar
                        value={grade.count}
                        max={Math.max(analytics.graded.length, 1)}
                        tone={grade.tone === 'danger' ? 'danger' : 'primary'}
                      />
                    </div>
                  )
                })}
              </div>

              {analytics.flagged > 0 ? (
                <p className="mt-6 flex items-start gap-2 border-t border-border-subtle pt-4 font-label-sm text-label-sm text-on-surface-variant">
                  <Icon name="flag" size={16} className="mt-0.5 text-error" />
                  {analytics.flagged} session{analytics.flagged === 1 ? '' : 's'} recorded security
                  flags. Review them on the Invigilate tab — they are advisory only.
                </p>
              ) : null}
            </section>
          </div>

          {/* Student table */}
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-6">
              <h2 className="font-headline-md text-headline-md text-on-surface">Student results</h2>
              <div className="relative w-full sm:w-72">
                <Icon
                  name="search"
                  size={20}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or reg number"
                  aria-label="Search students"
                  className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState icon="search_off" title="Nobody matches that search" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-container-low font-label-sm text-label-sm uppercase text-on-surface-variant">
                      <th className="p-4 font-semibold">Name</th>
                      <th className="p-4 font-semibold">Reg number</th>
                      <th className="p-4 font-semibold">Score</th>
                      <th className="p-4 font-semibold">Percentage</th>
                      <th className="p-4 font-semibold">Status</th>
                      <th className="p-4 font-semibold">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {[...visible]
                      .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1))
                      .map((session) => (
                        <tr
                          key={session.id}
                          className="transition-colors hover:bg-surface-container-low/50"
                        >
                          <td className="p-4 font-label-md text-label-md font-bold text-on-surface">
                            {session.student.fullName}
                          </td>
                          <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                            {session.student.regNumber}
                          </td>
                          <td className="p-4 font-body-md text-body-md text-on-surface">
                            {session.score ?? '—'} / {session.maxScore ?? '—'}
                          </td>
                          <td className="p-4">
                            {session.percentage === null ? (
                              <span className="font-label-md text-label-md text-on-surface-variant">
                                pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-surface-container px-3 py-1 font-label-md text-label-md font-bold text-on-surface">
                                {formatPercent(session.percentage)}
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                tone={
                                  session.status === 'IN_PROGRESS'
                                    ? 'info'
                                    : session.status === 'FLAGGED'
                                      ? 'danger'
                                      : 'success'
                                }
                              >
                                {sessionStatusLabel(session.status)}
                              </Badge>
                              {session.securityFlagCount > 0 ? (
                                <Badge tone="danger" icon="flag">
                                  {session.securityFlagCount}
                                </Badge>
                              ) : null}
                              {session.localServerId ? (
                                <Badge tone="info" icon="lan">
                                  LAN
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                            {formatDateTime(session.submittedAt)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-border-subtle p-4">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Showing {visible.length} of {data.meta.total} sittings
                {data.meta.total > data.sessions.length
                  ? ` · analytics cover the first ${data.sessions.length}`
                  : ''}
              </span>
            </div>
          </section>

          <p className="font-label-sm text-label-sm text-on-surface-variant">
            Per-question difficulty (the percentage correct for each question) is not shown
            here — the sessions endpoint reports scores, not per-answer verdicts, so any
            figure would be a guess. It is scheduled with the rest of the M3 reporting work.
          </p>
        </>
      )}
    </div>
  )
}

function Hero({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-6">
      <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p className="mt-2 font-headline-lg text-headline-lg text-on-surface">{value}</p>
      {sub ? <p className="font-label-sm text-label-sm text-outline">{sub}</p> : null}
    </div>
  )
}

/**
 * Export the cohort as CSV (PRD §4.5).
 *
 * Built in the browser from data already on screen rather than added as a server route:
 * the rows are here, and a download endpoint would be a second place for the tenant scope
 * to be got right.
 */
function exportCsv(examTitle: string, sessions: ExamSessionRow[]) {
  const header = [
    'Reg Number',
    'Full Name',
    'Class',
    'Status',
    'Score',
    'Max Score',
    'Percentage',
    'Answered',
    'Started At',
    'Submitted At',
    'Security Flags',
    'Source',
  ]

  const rows = sessions.map((session) => [
    session.student.regNumber,
    session.student.fullName,
    session.student.classLevel,
    session.status,
    session.score ?? '',
    session.maxScore ?? '',
    session.percentage ?? '',
    session.answeredCount,
    session.startedAt,
    session.submittedAt ?? '',
    session.securityFlagCount,
    session.localServerId ? 'LAN' : 'Online',
  ])

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')

  // BOM so Excel opens it as UTF-8 — without it Nigerian names with diacritics mojibake.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${examTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-results.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Quote a CSV cell.
 *
 * The leading apostrophe on `=`, `+`, `-` and `@` is deliberate: a spreadsheet treats a
 * cell starting with one of those as a formula, so a student legitimately named with a
 * leading hyphen — or a malicious roster entry — would otherwise execute on open.
 */
function escapeCsv(value: string | number): string {
  const text = String(value)
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}
