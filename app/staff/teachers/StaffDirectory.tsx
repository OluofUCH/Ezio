'use client'

import { useState, type FormEvent } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { ActiveSchoolBanner, SchoolGate } from '@/components/staff/SchoolGate'
import { canManageSchool, useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage, query } from '@/lib/client/api'
import { formatDate } from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { CreatedUser, StaffUser, StaffUserList, UserRole } from '@/lib/client/types'

export function StaffDirectory() {
  return (
    <SchoolGate>
      <DirectoryBody />
    </SchoolGate>
  )
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Platform admin',
  SCHOOL_ADMIN: 'School admin',
  TEACHER: 'Teacher',
}

function DirectoryBody() {
  const { role, withScope } = useScope()
  // Teachers may read the staff list (useful for seeing who authored an exam) but not
  // modify it, exactly as `POST /api/users` enforces.
  const admin = canManageSchool(role)

  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [resetting, setResetting] = useState<StaffUser | null>(null)
  const [resetDone, setResetDone] = useState<{ name: string; password: string } | null>(null)

  const { data, error, loading, refetch } = useApi<StaffUserList>(
    withScope(`/api/users${query({ pageSize: 100, search: search.trim() || undefined })}`),
  )

  async function setActive(user: StaffUser, isActive: boolean) {
    setActionError(null)
    setPendingId(user.id)
    try {
      await api.patch(withScope(`/api/users/${user.id}`), { isActive })
      refetch()
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <ActiveSchoolBanner />

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Staff
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Teachers and administrators who can sign in to this school.
          </p>
        </div>

        {admin ? (
          <button type="button" onClick={() => setAddOpen(true)} className="btn-primary shrink-0">
            <Icon name="person_add" size={20} />
            Add staff member
          </button>
        ) : null}
      </header>

      {actionError ? (
        <Alert tone="danger" title="That did not work" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      {resetDone ? (
        <Alert tone="success" title="Password reset" onDismiss={() => setResetDone(null)}>
          {resetDone.name} can now sign in with{' '}
          <strong className="font-mono">{resetDone.password}</strong>. Pass it on directly — it
          is not stored anywhere readable, so this is the only time it is shown. Ask them to
          change it from their own account page afterwards.
        </Alert>
      ) : null}

      <div className="card p-4">
        <div className="relative">
          <Icon
            name="search"
            size={20}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            aria-label="Search staff"
            className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          />
        </div>
      </div>

      {error ? (
        <Alert tone="danger" title="Could not load staff">
          {error}
          <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
            Try again
          </button>
        </Alert>
      ) : null}

      {loading ? (
        <LoadingPanel message="Loading staff…" />
      ) : data && data.users.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-container-low font-label-sm text-label-sm uppercase text-on-surface-variant">
                  <th className="p-4 font-semibold">Name</th>
                  <th className="p-4 font-semibold">Email</th>
                  <th className="p-4 font-semibold">Role</th>
                  <th className="p-4 font-semibold">Exams created</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Joined</th>
                  {admin ? <th className="p-4 text-right font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.users.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-surface-container-low/50">
                    <td className="p-4 font-label-md text-label-md font-bold text-on-surface">
                      {user.fullName}
                    </td>
                    <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                      {user.email}
                    </td>
                    <td className="p-4">
                      <Badge tone={user.role === 'TEACHER' ? 'neutral' : 'info'}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                      {user._count.examsCreated}
                    </td>
                    <td className="p-4">
                      <Badge tone={user.isActive ? 'success' : 'danger'}>
                        {user.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                    </td>
                    <td className="p-4 font-body-md text-body-md text-on-surface-variant">
                      {formatDate(user.createdAt)}
                    </td>
                    {admin ? (
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setResetting(user)}
                            disabled={pendingId === user.id}
                            title={`Reset password for ${user.fullName}`}
                            aria-label={`Reset password for ${user.fullName}`}
                            className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface disabled:opacity-50"
                          >
                            <Icon name="lock_reset" size={20} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void setActive(user, !user.isActive)}
                            disabled={pendingId === user.id}
                            className="rounded-md px-3 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface disabled:opacity-50"
                          >
                            {pendingId === user.id ? (
                              <Spinner size={16} />
                            ) : user.isActive ? (
                              'Deactivate'
                            ) : (
                              'Reactivate'
                            )}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="school"
            title={search ? 'Nobody matches that search' : 'No staff yet'}
            description={
              search ? 'Try a different name or email.' : 'Add the teachers who will author exams.'
            }
          />
        </div>
      )}

      <p className="font-label-sm text-label-sm text-on-surface-variant">
        Deactivating an account takes effect on that person&apos;s very next request — their
        session is not left running until it expires.
      </p>

      {admin ? (
        <AddStaffModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            refetch()
          }}
        />
      ) : null}

      {admin ? (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onReset={(name, password) => {
            setResetting(null)
            setResetDone({ name, password })
            refetch()
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Admin-initiated password reset.
 *
 * Authorised by role, not by knowing the old password — that is the whole difference
 * from the self-service form on `/staff/account`, and why this one is reachable only by
 * a school admin. It exists for the ordinary case of a teacher who has forgotten theirs.
 */
function ResetPasswordModal({
  user,
  onClose,
  onReset,
}: {
  user: StaffUser | null
  onClose: () => void
  onReset: (name: string, password: string) => void
}) {
  const { withScope } = useScope()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !user) return

    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      await api.patch(withScope(`/api/users/${user.id}`), { password })
      const issued = password
      setPassword('')
      onReset(user.fullName, issued)
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors())
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={user !== null}
      onClose={() => {
        setPassword('')
        setError(null)
        onClose()
      }}
      busy={busy}
      title="Reset this password?"
      icon="lock_reset"
      iconTone="danger"
      description={
        user
          ? `${user.fullName} (${user.email}) will sign in with whatever you set below. Their old password stops working immediately.`
          : undefined
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div>
          <label htmlFor="reset-password" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            New password
          </label>
          <input
            id="reset-password"
            // Plain text on purpose: an admin has to read this back to the person, and
            // masking a value they must transcribe only invites a typo.
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="field"
          />
          {fieldErrors.password ? (
            <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.password}</p>
          ) : (
            <p className="mt-1 font-label-sm text-label-sm text-outline">
              At least 10 characters. Ask them to change it from their own account page once
              they are in.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button type="submit" disabled={busy || password.length < 10} className="btn-primary w-full">
            {busy ? <Spinner size={20} /> : <Icon name="lock_reset" size={20} />}
            {busy ? 'Resetting…' : 'Set new password'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPassword('')
              setError(null)
              onClose()
            }}
            disabled={busy}
            className="btn-secondary w-full"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

function AddStaffModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const { withScope } = useScope()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [staffRole, setStaffRole] = useState<'TEACHER' | 'SCHOOL_ADMIN'>('TEACHER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      await api.post<CreatedUser>(withScope('/api/users'), {
        fullName,
        email,
        password,
        role: staffRole,
      })
      setFullName('')
      setEmail('')
      setPassword('')
      onAdded()
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors())
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Add a staff member" icon="person_add">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div>
          <label htmlFor="staff-name" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            Full name
          </label>
          <input
            id="staff-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            className="field"
          />
          {fieldErrors.fullName ? (
            <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.fullName}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="staff-email" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            Email
          </label>
          <input
            id="staff-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teacher@school.edu.ng"
            required
            className="field"
          />
          {fieldErrors.email ? (
            <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.email}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="staff-password" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            Temporary password
          </label>
          <input
            id="staff-password"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="field"
          />
          {fieldErrors.password ? (
            <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.password}</p>
          ) : (
            <p className="mt-1 font-label-sm text-label-sm text-outline">
              At least 10 characters. Shown in plain text so you can pass it on.
            </p>
          )}
        </div>

        <div>
          <span className="mb-2 block font-label-md text-label-md text-on-surface-variant">Role</span>
          <div className="flex gap-3">
            {(['TEACHER', 'SCHOOL_ADMIN'] as const).map((option) => (
              <label key={option} className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="staff-role"
                  value={option}
                  checked={staffRole === option}
                  onChange={() => setStaffRole(option)}
                  className="peer sr-only"
                />
                <span className="block rounded-lg border border-outline-variant bg-surface px-4 py-3 text-center font-label-md text-label-md text-on-surface-variant transition-all peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:text-on-surface">
                  {ROLE_LABELS[option]}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 font-label-sm text-label-sm text-outline">
            Admins can additionally manage the roster, staff and hall servers.
          </p>
        </div>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner size={20} /> : <Icon name="person_add" size={20} />}
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </Modal>
  )
}
