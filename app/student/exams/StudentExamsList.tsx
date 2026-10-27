'use client'

import { useState } from 'react'
import { Alert, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel } from '@/components/ui/Spinner'
import { ExamCard } from '@/components/student/ExamCard'
import { classLevelLabel } from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { StudentExamList } from '@/lib/client/types'

type Filter = 'all' | 'open' | 'scheduled' | 'closed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'closed', label: 'Closed' },
]

export function StudentExamsList() {
  const { data, error, loading, refetch } = useApi<StudentExamList>('/api/student/exams')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  if (loading) return <LoadingPanel message="Loading your exams…" />

  if (error && !data) {
    return (
      <Alert tone="danger" title="Could not load your exams">
        {error}
        <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
          Try again
        </button>
      </Alert>
    )
  }

  if (!data) return null

  const term = search.trim().toLowerCase()
  const visible = data.exams.filter((exam) => {
    const matchesFilter =
      filter === 'all'
        ? true
        : filter === 'open'
          ? exam.canStart || exam.canResume
          : filter === 'scheduled'
            ? exam.windowState === 'NOT_YET_OPEN'
            : exam.windowState === 'CLOSED'

    const matchesSearch =
      term === '' ||
      exam.title.toLowerCase().includes(term) ||
      exam.subject.toLowerCase().includes(term)

    return matchesFilter && matchesSearch
  })

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            My Exams
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Every exam published for {classLevelLabel(data.student.classLevel)}.
          </p>
        </div>

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
            placeholder="Search by title or subject"
            aria-label="Search exams"
            className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter exams">
        {FILTERS.map((option) => {
          const count =
            option.key === 'all'
              ? data.exams.length
              : option.key === 'open'
                ? data.exams.filter((e) => e.canStart || e.canResume).length
                : option.key === 'scheduled'
                  ? data.exams.filter((e) => e.windowState === 'NOT_YET_OPEN').length
                  : data.exams.filter((e) => e.windowState === 'CLOSED').length

          const active = filter === option.key
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(option.key)}
              className={
                active
                  ? 'rounded-full border border-primary-container bg-primary-container px-5 py-2 font-label-md text-label-md text-on-surface shadow-sm'
                  : 'rounded-full border border-outline-variant bg-surface px-5 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container'
              }
            >
              {option.label}
              <span className="ml-2 opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="quiz"
            title={data.exams.length === 0 ? 'No exams published yet' : 'Nothing matches that'}
            description={
              data.exams.length === 0
                ? `When your teacher publishes an exam for ${classLevelLabel(
                    data.student.classLevel,
                  )}, it will appear here.`
                : 'Try a different filter or search term.'
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          {visible.map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </div>
  )
}
