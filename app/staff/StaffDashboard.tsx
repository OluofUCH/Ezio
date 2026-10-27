'use client'

import Link from 'next/link'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel } from '@/components/ui/Spinner'
import { StatCard } from '@/components/ui/Stats'
import { ActiveSchoolBanner, SchoolGate } from '@/components/staff/SchoolGate'
import { canManageSchool, useScope } from '@/components/staff/ScopeProvider'
import {
  classLevelLabel,
  formatCount,
  formatDate,
  formatRelative,
  subjectIcon,
} from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { ExamList, LocalServerList, StudentList } from '@/lib/client/types'

export function StaffDashboard() {
  return (
    <SchoolGate>
      <DashboardBody />
    </SchoolGate>
  )
}

function DashboardBody() {
  const { role, withScope } = useScope()
  const admin = canManageSchool(role)

  const exams = useApi<ExamList>(withScope('/api/exams?pageSize=100'))
  const students = useApi<StudentList>(withScope('/api/students?pageSize=1'))
  // Local servers are school-admin-only on the server (`canManageSchool`), so a teacher's
  // dashboard does not request them at all rather than swallowing a 403.
  const servers = useApi<LocalServerList>(admin ? withScope('/api/local-servers') : null)

  if (exams.loading) return <LoadingPanel message="Loading your school…" />

  if (exams.error && !exams.data) {
    return (
      <Alert tone="danger" title="Could not load the dashboard">
        {exams.error}
        <button type="button" onClick={exams.refetch} className="mt-3 block font-label-md underline">
          Try again
        </button>
      </Alert>
    )
  }

  const all = exams.data?.exams ?? []
  const published = all.filter((exam) => exam.isPublished)
  const drafts = all.filter((exam) => !exam.isPublished)
  const totalSittings = all.reduce((sum, exam) => sum + exam._count.examSessions, 0)
  const missingQuestions = drafts.filter((exam) => exam._count.questions === 0)

  return (
    <div className="space-y-6">
      <ActiveSchoolBanner />

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            {admin ? 'School overview' : 'Teacher dashboard'}
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {admin
              ? 'Exams, roster and hall servers at a glance.'
              : 'Your exams and how your classes are performing.'}
          </p>
        </div>

        <Link href="/staff/exams/new" className="btn-primary shrink-0">
          <Icon name="add" size={20} />
          Create exam
        </Link>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Published exams"
          value={published.length}
          icon="assignment_turned_in"
          detail={drafts.length > 0 ? `${drafts.length} draft` : undefined}
        />
        <StatCard label="Total sittings" value={formatCount(totalSittings)} icon="how_to_reg" tone="info" />
        <StatCard
          label="Students"
          value={students.data ? formatCount(students.data.meta.total) : '—'}
          icon="group"
          tone="neutral"
        />
        <StatCard
          label={admin ? 'Hall servers' : 'Questions authored'}
          value={
            admin
              ? (servers.data?.localServers.length ?? '—')
              : formatCount(all.reduce((sum, exam) => sum + exam._count.questions, 0))
          }
          icon={admin ? 'dns' : 'database'}
          tone="neutral"
        />
      </div>

      {/* An unpublishable draft is the most actionable thing on this page: publishing is
          refused outright while an exam has no questions. */}
      {missingQuestions.length > 0 ? (
        <Alert tone="warning" title={`${missingQuestions.length} exam${missingQuestions.length === 1 ? '' : 's'} cannot be published yet`}>
          No questions have been added, so publishing is blocked — a student starting one
          would see an empty paper.
          <ul className="mt-2 space-y-1">
            {missingQuestions.slice(0, 4).map((exam) => (
              <li key={exam.id}>
                <Link href={`/staff/exams/${exam.id}`} className="font-label-md underline">
                  {exam.title}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-3">
        {/* Recent exams */}
        <section className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border-subtle p-6">
            <h2 className="font-headline-md text-headline-md text-on-surface">Recent exams</h2>
            <Link
              href="/staff/exams"
              className="font-label-md text-label-md text-primary hover:underline"
            >
              View all
            </Link>
          </div>

          {all.length === 0 ? (
            <EmptyState
              icon="quiz"
              title="No exams yet"
              description="Create one, upload your questions from a spreadsheet, then publish it to your class."
              action={
                <Link href="/staff/exams/new" className="btn-primary">
                  <Icon name="add" size={20} />
                  Create your first exam
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {all.slice(0, 6).map((exam) => (
                <li key={exam.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
                      <Icon name={subjectIcon(exam.subject)} size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-label-md text-label-md font-bold text-on-surface">
                        {exam.title}
                      </p>
                      <p className="truncate font-label-sm text-label-sm text-on-surface-variant">
                        {classLevelLabel(exam.classLevel)} · {exam._count.questions} questions ·{' '}
                        {exam._count.examSessions} sittings
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={exam.isPublished ? 'success' : 'neutral'}>
                      {exam.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                    <Link
                      href={`/staff/exams/${exam.id}`}
                      className="rounded border border-outline-variant px-3 py-1.5 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container"
                    >
                      Manage
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Side column */}
        <div className="space-y-gutter">
          {admin ? (
            <section className="card">
              <div className="flex items-center justify-between border-b border-border-subtle p-6">
                <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
                  <Icon name="dns" size={20} />
                  Hall servers
                </h2>
                <Link
                  href="/staff/local-servers"
                  className="font-label-md text-label-md text-primary hover:underline"
                >
                  Manage
                </Link>
              </div>

              {servers.loading ? (
                <LoadingPanel message="Checking servers…" />
              ) : servers.data && servers.data.localServers.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {servers.data.localServers.slice(0, 4).map((server) => {
                    // "Synced" here means recently in contact, not a live connection —
                    // a LAN server only reaches the cloud when it has internet.
                    const recent =
                      server.lastSyncedAt !== null &&
                      Date.now() - new Date(server.lastSyncedAt).getTime() < 24 * 60 * 60 * 1000

                    return (
                      <li key={server.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`h-3 w-3 shrink-0 rounded-full ${
                              !server.isActive
                                ? 'bg-outline'
                                : recent
                                  ? 'bg-status-synced shadow-[0_0_8px_rgba(37,99,235,0.5)]'
                                  : 'bg-status-pending shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                            }`}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="truncate font-label-md text-label-md font-semibold text-on-surface">
                              {server.name}
                            </p>
                            <p className="truncate font-label-sm text-label-sm text-on-surface-variant">
                              {server.lastSeenIp ?? 'never seen'}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`shrink-0 text-right font-label-sm text-label-sm ${
                            recent ? 'text-status-synced' : 'text-status-pending'
                          }`}
                        >
                          {formatRelative(server.lastSyncedAt)}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon="dns"
                  title="No hall servers"
                  description="Provision one to run exams on your school network without internet."
                />
              )}
            </section>
          ) : null}

          <section className="card p-6">
            <h2 className="font-headline-md text-headline-md text-on-surface">Quick actions</h2>
            <div className="mt-4 space-y-2">
              <QuickLink href="/staff/exams/new" icon="add_circle" label="Create an exam" />
              <QuickLink
                href="/api/templates/questions.xlsx"
                icon="download"
                label="Question template (.xlsx)"
                external
              />
              {admin ? (
                <>
                  <QuickLink href="/staff/students" icon="group_add" label="Import students" />
                  <QuickLink
                    href="/api/templates/students.csv"
                    icon="download"
                    label="Student template (.csv)"
                    external
                  />
                </>
              ) : null}
            </div>
          </section>

          {drafts.length > 0 ? (
            <section className="card p-6">
              <h2 className="font-headline-md text-headline-md text-on-surface">Drafts</h2>
              <ul className="mt-4 space-y-3">
                {drafts.slice(0, 4).map((exam) => (
                  <li key={exam.id}>
                    <Link
                      href={`/staff/exams/${exam.id}`}
                      className="block rounded-lg border border-border-subtle p-3 transition-colors hover:border-primary-container"
                    >
                      <p className="truncate font-label-md text-label-md text-on-surface">{exam.title}</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        Edited {formatDate(exam.updatedAt)} · {exam._count.questions} questions
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  label,
  external = false,
}: {
  href: string
  icon: string
  label: string
  external?: boolean
}) {
  const className =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface'

  // Template downloads are plain server responses, not app routes — a Link would try to
  // client-navigate to a spreadsheet.
  if (external) {
    return (
      <a href={href} className={className}>
        <Icon name={icon} size={20} />
        {label}
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      <Icon name={icon} size={20} />
      {label}
    </Link>
  )
}
