'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel } from '@/components/ui/Spinner'
import { ActiveSchoolBanner, SchoolGate } from '@/components/staff/SchoolGate'
import { useScope } from '@/components/staff/ScopeProvider'
import { query } from '@/lib/client/api'
import {
  classLevelLabel,
  examModeLabel,
  formatDate,
  formatDuration,
  subjectIcon,
} from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import { CLASS_LEVELS, type ClassLevel, type ExamList } from '@/lib/client/types'

export function StaffExamsList() {
  return (
    <SchoolGate>
      <ExamsBody />
    </SchoolGate>
  )
}

const PAGE_SIZE = 20

function ExamsBody() {
  const { withScope } = useScope()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [classLevel, setClassLevel] = useState<ClassLevel | ''>('')
  const [status, setStatus] = useState<'' | 'true' | 'false'>('')

  // Filtering happens on the server so a school with hundreds of exams is not shipped
  // to the browser to be filtered there.
  const path = withScope(
    `/api/exams${query({
      page,
      pageSize: PAGE_SIZE,
      search: search.trim() || undefined,
      classLevel: classLevel || undefined,
      isPublished: status || undefined,
    })}`,
  )

  const { data, error, loading, refetch } = useApi<ExamList>(path)

  function resetTo(updater: () => void) {
    // Any filter change invalidates the current page number.
    updater()
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <ActiveSchoolBanner />

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Exams
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Create, populate and publish papers for your classes.
          </p>
        </div>
        <Link href="/staff/exams/new" className="btn-primary shrink-0">
          <Icon name="add" size={20} />
          Create exam
        </Link>
      </header>

      {/* Filters */}
      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon
            name="search"
            size={20}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => resetTo(() => setSearch(event.target.value))}
            placeholder="Search by title"
            aria-label="Search exams by title"
            className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          />
        </div>

        <select
          value={classLevel}
          onChange={(event) => resetTo(() => setClassLevel(event.target.value as ClassLevel | ''))}
          aria-label="Filter by class level"
          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-label-md text-label-md text-on-surface"
        >
          <option value="">All classes</option>
          {CLASS_LEVELS.map((level) => (
            <option key={level} value={level}>
              {classLevelLabel(level)}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => resetTo(() => setStatus(event.target.value as '' | 'true' | 'false'))}
          aria-label="Filter by publication status"
          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-label-md text-label-md text-on-surface"
        >
          <option value="">All statuses</option>
          <option value="true">Published</option>
          <option value="false">Draft</option>
        </select>
      </div>

      {error ? (
        <Alert tone="danger" title="Could not load exams">
          {error}
          <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
            Try again
          </button>
        </Alert>
      ) : null}

      {loading ? (
        <LoadingPanel message="Loading exams…" />
      ) : data && data.exams.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
            {data.exams.map((exam) => (
              <Link
                key={exam.id}
                href={`/staff/exams/${exam.id}`}
                className="card flex flex-col gap-4 p-6 transition-all hover:border-primary-container hover:shadow-level-2"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
                    <Icon name={subjectIcon(exam.subject)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-headline-md text-headline-md leading-tight text-on-surface">
                      {exam.title}
                    </h2>
                    <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
                      {exam.subject} · {classLevelLabel(exam.classLevel)}
                    </p>
                  </div>
                  <Badge tone={exam.isPublished ? 'success' : 'neutral'}>
                    {exam.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 sm:grid-cols-4">
                  <Fact label="Questions" value={String(exam._count.questions)} />
                  <Fact label="Duration" value={formatDuration(exam.durationMins)} />
                  <Fact label="Mode" value={examModeLabel(exam.mode)} />
                  <Fact label="Sittings" value={String(exam._count.examSessions)} />
                </dl>

                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {exam.createdBy ? `${exam.createdBy.fullName} · ` : ''}updated{' '}
                  {formatDate(exam.updatedAt)}
                  {exam._count.questions === 0 ? (
                    <span className="ml-2 text-error">· needs questions before publishing</span>
                  ) : null}
                </p>
              </Link>
            ))}
          </div>

          {data.meta.totalPages > 1 ? (
            <div className="card flex items-center justify-between p-4">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} exams
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
        </>
      ) : (
        <div className="card">
          <EmptyState
            icon="quiz"
            title={search || classLevel || status ? 'No exams match those filters' : 'No exams yet'}
            description={
              search || classLevel || status
                ? 'Try clearing a filter.'
                : 'Create one, upload your questions from a spreadsheet, then publish it to your class.'
            }
            action={
              <Link href="/staff/exams/new" className="btn-primary">
                <Icon name="add" size={20} />
                Create exam
              </Link>
            }
          />
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 font-label-md text-label-md text-on-surface">{value}</dd>
    </div>
  )
}
