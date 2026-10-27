'use client'

import { useState, type FormEvent } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { StudentImport } from '@/components/staff/StudentImport'
import { ActiveSchoolBanner, SchoolGate } from '@/components/staff/SchoolGate'
import { canManageSchool, useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage, query } from '@/lib/client/api'
import { classLevelLabel, formatCount, formatDate } from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import {
  CLASS_LEVELS,
  type ClassLevel,
  type CreatedStudent,
  type ResetPinResult,
  type Student,
  type StudentList,
} from '@/lib/client/types'

export function StudentRoster() {
  return (
    <SchoolGate>
      <RosterBody />
    </SchoolGate>
  )
}

const PAGE_SIZE = 50

function RosterBody() {
  const { role, withScope } = useScope()
  const admin = canManageSchool(role)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [classLevel, setClassLevel] = useState<ClassLevel | ''>('')
  const [showPins, setShowPins] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [resetting, setResetting] = useState<Student | null>(null)
  const [resetResult, setResetResult] = useState<ResetPinResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, error, loading, refetch } = useApi<StudentList>(
    withScope(
      `/api/students${query({
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
        classLevel: classLevel || undefined,
      })}`,
    ),
  )

  async function resetPin(student: Student) {
    setActionError(null)
    try {
      const result = await api.post<ResetPinResult>(
        withScope(`/api/students/${student.id}/reset-pin`),
      )
      setResetResult(result)
      setResetting(null)
      refetch()
    } catch (err) {
      // The server refuses a reset while the student has an exam open — resetting then
      // would lock them out if they had to sign in again.
      setActionError(errorMessage(err))
      setResetting(null)
    }
  }

  return (
    <div className="space-y-6">
      <ActiveSchoolBanner />

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Students
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {data ? `${formatCount(data.meta.total)} enrolled` : 'Loading roster…'}
            {admin ? ' · registration number and PIN are their exam login.' : ''}
          </p>
        </div>

        {admin ? (
          <button type="button" onClick={() => setAddOpen(true)} className="btn-primary shrink-0">
            <Icon name="person_add" size={20} />
            Add student
          </button>
        ) : null}
      </header>

      {actionError ? (
        <Alert tone="danger" title="That did not work" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      {resetResult ? (
        <Alert tone="success" title="PIN reset" onDismiss={() => setResetResult(null)}>
          {resetResult.student.fullName} ({resetResult.student.regNumber}) now signs in with PIN{' '}
          <strong className="tabular text-lg">{resetResult.pin}</strong>. Write it down — it is
          also readable from the roster below.
        </Alert>
      ) : null}

      {admin ? (
        <section className="card p-6">
          <h2 className="font-headline-md text-headline-md text-on-surface">Bulk import</h2>
          <p className="mb-4 mt-1 font-body-md text-body-md text-on-surface-variant">
            Enrol a whole class from a spreadsheet. PINs are generated for any row that leaves
            the column blank.
          </p>
          <StudentImport onImported={refetch} />
        </section>
      ) : null}

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
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search name or registration number"
            aria-label="Search students"
            className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          />
        </div>

        <select
          value={classLevel}
          onChange={(event) => {
            setClassLevel(event.target.value as ClassLevel | '')
            setPage(1)
          }}
          aria-label="Filter by class"
          className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-label-md text-label-md text-on-surface"
        >
          <option value="">All classes</option>
          {CLASS_LEVELS.map((level) => (
            <option key={level} value={level}>
              {classLevelLabel(level)}
            </option>
          ))}
        </select>

        {data?.pinsVisible ? (
          <label className="flex items-center gap-2 whitespace-nowrap font-label-md text-label-md text-on-surface-variant">
            <input
              type="checkbox"
              checked={showPins}
              onChange={(event) => setShowPins(event.target.checked)}
              className="h-4 w-4 accent-[#4a6700]"
            />
            Show PINs
          </label>
        ) : null}
      </div>

      {error ? (
        <Alert tone="danger" title="Could not load the roster">
          {error}
          <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
            Try again
          </button>
        </Alert>
      ) : null}

      {loading ? (
        <LoadingPanel message="Loading roster…" />
      ) : data && data.students.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-container-low font-label-sm text-label-sm uppercase text-on-surface-variant">
                  <th className="p-4 font-semibold">Name</th>
                  <th className="p-4 font-semibold">Reg number</th>
                  <th className="p-4 font-semibold">Class</th>
                  {data.pinsVisible ? <th className="p-4 font-semibold">PIN</th> : null}
                  <th className="p-4 font-semibold">Sittings</th>
                  <th className="p-4 font-semibold">Enrolled</th>
                  {admin ? <th className="p-4 text-right font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.students.map((student) => (
                  <tr key={student.id} className="group transition-colors hover:bg-surface-container-low/50">
                    <td className="p-4 font-label-md text-label-md font-bold text-on-surface">
                      {student.fullName}
                    </td>
                    <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                      {student.regNumber}
                    </td>
                    <td className="p-4">
                      <Badge tone="neutral">{classLevelLabel(student.classLevel)}</Badge>
                    </td>
                    {data.pinsVisible ? (
                      <td className="p-4 font-body-md text-body-md">
                        {/* Masked by default: a roster is often projected or left open on
                            a shared office machine. */}
                        <span className="tabular text-on-surface">
                          {showPins ? (student.pin ?? '—') : '••••'}
                        </span>
                      </td>
                    ) : null}
                    <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                      {student._count.examSessions}
                    </td>
                    <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                      {formatDate(student.createdAt)}
                    </td>
                    {admin ? (
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={() => setResetting(student)}
                          className="rounded-md p-1.5 text-on-surface-variant opacity-0 transition-all hover:bg-surface-variant hover:text-on-surface focus:opacity-100 group-hover:opacity-100"
                          title={`Reset PIN for ${student.fullName}`}
                          aria-label={`Reset PIN for ${student.fullName}`}
                        >
                          <Icon name="lock_reset" size={20} />
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border-subtle p-4">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Page {data.meta.page} of {data.meta.totalPages} · {formatCount(data.meta.total)}{' '}
                students
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
      ) : (
        <div className="card">
          <EmptyState
            icon="group"
            title={search || classLevel ? 'Nobody matches those filters' : 'No students enrolled'}
            description={
              search || classLevel
                ? 'Try clearing a filter.'
                : admin
                  ? 'Import a roster above, or add students one at a time.'
                  : 'Ask your school administrator to import the roster.'
            }
          />
        </div>
      )}

      {admin ? (
        <AddStudentModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            refetch()
          }}
        />
      ) : null}

      <Modal
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title="Reset this student's PIN?"
        icon="lock_reset"
        iconTone="danger"
        description={
          resetting
            ? `${resetting.fullName} (${resetting.regNumber}) will be given a new PIN. Their old one stops working immediately, so you will need to hand them the new one.`
            : undefined
        }
        footer={
          <>
            <button type="button" onClick={() => setResetting(null)} className="btn-primary w-full">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => resetting && void resetPin(resetting)}
              className="w-full rounded-lg border-2 border-error py-3 font-label-md text-label-md font-bold text-error transition-colors hover:bg-error-container"
            >
              Generate a new PIN
            </button>
          </>
        }
      />
    </div>
  )
}

function AddStudentModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const { withScope } = useScope()
  const [regNumber, setRegNumber] = useState('')
  const [fullName, setFullName] = useState('')
  const [classLevel, setClassLevel] = useState<ClassLevel | ''>('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [created, setCreated] = useState<CreatedStudent | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      const result = await api.post<CreatedStudent>(withScope('/api/students'), {
        regNumber,
        fullName,
        classLevel,
        // Omitted entirely rather than sent empty: the server generates a CSPRNG PIN
        // when the field is absent, but an empty string fails `pinSchema`.
        ...(pin ? { pin } : {}),
      })
      setCreated(result)
      setRegNumber('')
      setFullName('')
      setPin('')
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors())
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setCreated(null)
        setError(null)
        onClose()
      }}
      busy={busy}
      title={created ? 'Student added' : 'Add a student'}
      icon={created ? 'check_circle' : 'person_add'}
    >
      {created ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-container-low p-4 text-center">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              Exam login
            </p>
            <p className="mt-2 font-headline-md text-headline-md text-on-surface">
              {created.student.regNumber}
            </p>
            <p className="tabular mt-1 font-display-lg text-headline-lg text-on-primary-container">
              {created.student.pin ?? '—'}
            </p>
            <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
              {created.student.fullName} · {classLevelLabel(created.student.classLevel)}
              {created.pinGenerated ? ' · PIN generated automatically' : ''}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setCreated(null)} className="btn-primary w-full">
              Add another
            </button>
            <button
              type="button"
              onClick={() => {
                setCreated(null)
                onAdded()
              }}
              className="btn-secondary w-full"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <div>
            <label htmlFor="add-reg" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
              Registration number
            </label>
            <input
              id="add-reg"
              value={regNumber}
              onChange={(event) => setRegNumber(event.target.value)}
              placeholder="e.g. EDU-2024-001"
              required
              className="field"
            />
            {fieldErrors.regNumber ? (
              <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.regNumber}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="add-name" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
              Full name
            </label>
            <input
              id="add-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="e.g. Adebayo Oluwaseun"
              required
              className="field"
            />
            {fieldErrors.fullName ? (
              <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.fullName}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="add-class" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
              Class level
            </label>
            <select
              id="add-class"
              value={classLevel}
              onChange={(event) => setClassLevel(event.target.value as ClassLevel)}
              required
              className="field"
            >
              <option value="" disabled>
                Select class
              </option>
              {CLASS_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {classLevelLabel(level)}
                </option>
              ))}
            </select>
            {fieldErrors.classLevel ? (
              <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.classLevel}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="add-pin" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
              PIN <span className="text-outline">(optional)</span>
            </label>
            <input
              id="add-pin"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Leave blank to generate one"
              inputMode="numeric"
              className="field"
            />
            {fieldErrors.pin ? (
              <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.pin}</p>
            ) : (
              <p className="mt-1 font-label-sm text-label-sm text-outline">4 to 8 digits.</p>
            )}
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner size={20} /> : <Icon name="person_add" size={20} />}
            {busy ? 'Adding…' : 'Add student'}
          </button>
        </form>
      )}
    </Modal>
  )
}
