'use client'

import { useEffect, useState } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { useScope } from '@/components/staff/ScopeProvider'
import { api, errorMessage, query } from '@/lib/client/api'
import {
  formatCountdown,
  formatDateTime,
  formatPercent,
  formatRelative,
  sessionStatusLabel,
} from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { ExamSessionList, SessionStatus } from '@/lib/client/types'

type SweepResult = {
  exam: { id: string; title: string }
  swept: number
  stillRunning: number
  examined: number
  sweptAt: string
}

/** Live view refresh cadence while a hall is sitting. */
const REFRESH_MS = 20_000

/**
 * Invigilation — who has started, who is still writing, how long each has left.
 *
 * This is the screen a teacher watches *during* an exam, not the report they read after
 * it; the analytics live on the results page. It polls rather than streaming: a hall is
 * tens of rows, and a 20-second refresh costs one query where a socket per invigilator
 * would need infrastructure this milestone does not have.
 */
export function SessionMonitor({ examId }: { examId: string }) {
  const { withScope } = useScope()
  const [status, setStatus] = useState<SessionStatus | ''>('')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const path = withScope(
    `/api/exams/${examId}/sessions${query({ pageSize: 200, status: status || undefined })}`,
  )
  const { data, error, loading, refreshing, refetch } = useApi<ExamSessionList>(path)

  const [sweeping, setSweeping] = useState(false)
  const [sweepNotice, setSweepNotice] = useState<string | null>(null)
  const [sweepError, setSweepError] = useState<string | null>(null)

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(refetch, REFRESH_MS)
    return () => clearInterval(timer)
  }, [autoRefresh, refetch])

  async function sweep() {
    setSweeping(true)
    setSweepError(null)
    setSweepNotice(null)

    try {
      const result = await api.post<SweepResult>(
        withScope(`/api/exams/${examId}/sessions/sweep-expired`),
      )
      setSweepNotice(
        result.swept === 0
          ? `Nothing to close — ${result.stillRunning} student${
              result.stillRunning === 1 ? ' is' : 's are'
            } still within time.`
          : `Closed and graded ${result.swept} expired session${result.swept === 1 ? '' : 's'}. ${
              result.stillRunning
            } still writing.`,
      )
      refetch()
    } catch (err) {
      setSweepError(errorMessage(err))
    } finally {
      setSweeping(false)
    }
  }

  if (loading) return <LoadingPanel message="Loading sessions…" />

  if (error && !data) {
    return (
      <Alert tone="danger" title="Could not load sessions">
        {error}
        <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
          Try again
        </button>
      </Alert>
    )
  }

  if (!data) return null

  const inProgress = data.sessions.filter((session) => session.status === 'IN_PROGRESS')
  const stranded = data.sessions.filter((session) => session.awaitingAutoSubmit)
  const flagged = data.sessions.filter((session) => session.securityFlagCount > 0)
  const offline = data.sessions.filter((session) => session.localServerId !== null)

  return (
    <div className="space-y-6">
      {sweepNotice ? (
        <Alert tone="success" onDismiss={() => setSweepNotice(null)}>
          {sweepNotice}
        </Alert>
      ) : null}
      {sweepError ? (
        <Alert tone="danger" title="Sweep failed" onDismiss={() => setSweepError(null)}>
          {sweepError}
        </Alert>
      ) : null}

      {/* A stranded session is one whose clock ran out but which is still IN_PROGRESS:
          the student closed the laptop or lost the network, so no request of theirs has
          arrived to trigger the lazy auto-submit. */}
      {stranded.length > 0 ? (
        <Alert tone="warning" title={`${stranded.length} session${stranded.length === 1 ? '' : 's'} past time but not submitted`}>
          <p>
            These students stopped sending requests before their time ran out — a closed lid
            or a dropped connection. Their answers are safe on the server; sweeping closes
            and grades them exactly as a self-submission would.
          </p>
          <button
            type="button"
            onClick={() => void sweep()}
            disabled={sweeping}
            className="btn-primary mt-3"
          >
            {sweeping ? <Spinner size={20} /> : <Icon name="gavel" size={20} />}
            {sweeping ? 'Closing…' : 'Close and grade them'}
          </button>
        </Alert>
      ) : null}

      {/* Counters */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Counter label="Writing now" value={inProgress.length} icon="edit_note" tone="info" />
        <Counter label="Submitted" value={data.sessions.length - inProgress.length} icon="task_alt" />
        <Counter
          label="Security flags"
          value={flagged.length}
          icon="flag"
          tone={flagged.length > 0 ? 'danger' : 'neutral'}
        />
        <Counter label="From hall servers" value={offline.length} icon="lan" tone="neutral" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
          <div className="flex items-center gap-3">
            <h3 className="font-headline-md text-headline-md text-on-surface">Sessions</h3>
            {refreshing ? <Spinner size={16} className="text-primary" /> : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface-variant">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                className="h-4 w-4 accent-[#4a6700]"
              />
              Auto-refresh
            </label>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as SessionStatus | '')}
              aria-label="Filter by status"
              className="rounded-lg border border-outline-variant bg-surface px-3 py-1.5 font-label-md text-label-md text-on-surface"
            >
              <option value="">All statuses</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="AUTO_SUBMITTED">Auto-submitted</option>
              <option value="FLAGGED">Flagged</option>
            </select>

            <button
              type="button"
              onClick={refetch}
              className="rounded-lg border border-outline-variant p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
              aria-label="Refresh now"
            >
              <Icon name="refresh" size={18} />
            </button>
          </div>
        </div>

        {data.sessions.length === 0 ? (
          <EmptyState
            icon="monitor"
            title="Nobody has started yet"
            description="Sessions appear here the moment a student begins the exam, whether online or synced up from a hall server."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-container-low font-label-sm text-label-sm uppercase text-on-surface-variant">
                  <th className="p-4 font-semibold">Student</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Progress</th>
                  <th className="p-4 font-semibold">Time left</th>
                  <th className="p-4 font-semibold">Score</th>
                  <th className="p-4 font-semibold">Flags</th>
                  <th className="p-4 font-semibold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.sessions.map((session) => (
                  <tr
                    key={session.id}
                    className={`transition-colors hover:bg-surface-container-low/50 ${
                      session.awaitingAutoSubmit ? 'bg-[#fffbeb]' : ''
                    }`}
                  >
                    <td className="p-4">
                      <p className="font-label-md text-label-md font-bold text-on-surface">
                        {session.student.fullName}
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        {session.student.regNumber}
                      </p>
                    </td>

                    <td className="p-4">
                      {session.awaitingAutoSubmit ? (
                        <Badge tone="warning" icon="timer_off">
                          Past time
                        </Badge>
                      ) : (
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
                      )}
                      <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
                        {session.submittedAt
                          ? formatRelative(session.submittedAt)
                          : `started ${formatRelative(session.startedAt)}`}
                      </p>
                    </td>

                    <td className="p-4 font-body-md text-body-md text-on-surface">
                      {session.answeredCount} answered
                    </td>

                    <td className="p-4">
                      {session.status === 'IN_PROGRESS' ? (
                        <span
                          className={`tabular font-label-md text-label-md ${
                            session.secondsRemaining < 300 ? 'font-bold text-error' : 'text-on-surface'
                          }`}
                        >
                          {formatCountdown(session.secondsRemaining)}
                        </span>
                      ) : (
                        <span className="font-label-md text-label-md text-on-surface-variant">—</span>
                      )}
                    </td>

                    <td className="p-4">
                      {session.percentage === null ? (
                        <span className="font-label-md text-label-md text-on-surface-variant">—</span>
                      ) : (
                        <span className="font-label-md text-label-md font-bold text-on-surface">
                          {formatPercent(session.percentage)}
                          <span className="ml-1 font-normal text-on-surface-variant">
                            ({session.score}/{session.maxScore})
                          </span>
                        </span>
                      )}
                    </td>

                    <td className="p-4">
                      {session.securityFlagCount === 0 ? (
                        <span className="font-label-md text-label-md text-on-surface-variant">—</span>
                      ) : (
                        <SecurityFlagCell
                          count={session.securityFlagCount}
                          flags={session.securityFlags}
                        />
                      )}
                    </td>

                    <td className="p-4">
                      {session.localServerId ? (
                        <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-status-synced">
                          <Icon name="lan" size={16} />
                          Hall server
                          <span className="text-on-surface-variant">
                            {session.syncedAt ? `· synced ${formatRelative(session.syncedAt)}` : '· unsynced'}
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                          <Icon name="wifi" size={16} />
                          Online
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="font-label-sm text-label-sm text-on-surface-variant">
        Security flags are recorded for your judgement only — they never auto-penalise a
        student. A blur event can just as easily be an on-screen keyboard, a low-battery
        notification, or an antivirus popup stealing focus.
      </p>
    </div>
  )
}

function Counter({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string
  value: number
  icon: string
  tone?: 'primary' | 'info' | 'danger' | 'neutral'
}) {
  const tones = {
    primary: 'bg-primary-container/20 text-on-primary-container',
    info: 'bg-secondary-fixed text-on-secondary-fixed',
    danger: 'bg-error-container text-on-error-container',
    neutral: 'bg-surface-container text-on-surface-variant',
  } as const

  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon name={icon} size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate font-label-sm text-label-sm text-on-surface-variant">{label}</p>
        <p className="font-headline-md text-headline-md text-on-surface">{value}</p>
      </div>
    </div>
  )
}

function SecurityFlagCell({
  count,
  flags,
}: {
  count: number
  flags: { type: string; at: string }[]
}) {
  const [open, setOpen] = useState(false)

  // Group by type: "TAB_BLUR ×7" tells an invigilator more than seven identical rows.
  const grouped = flags.reduce<Map<string, number>>((map, flag) => {
    map.set(flag.type, (map.get(flag.type) ?? 0) + 1)
    return map
  }, new Map())

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-md bg-error-container/40 px-2 py-1 font-label-md text-label-md text-on-error-container transition-colors hover:bg-error-container"
        aria-expanded={open}
      >
        <Icon name="flag" size={16} />
        {count}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border-subtle bg-surface p-3 shadow-xl">
          <ul className="space-y-1">
            {[...grouped.entries()].map(([type, occurrences]) => (
              <li
                key={type}
                className="flex justify-between font-label-sm text-label-sm text-on-surface-variant"
              >
                <span>{type.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="font-bold text-on-surface">×{occurrences}</span>
              </li>
            ))}
          </ul>
          {flags.length > 0 ? (
            <p className="mt-2 border-t border-border-subtle pt-2 font-label-sm text-label-sm text-outline">
              Last: {formatDateTime(flags[flags.length - 1]?.at)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
