'use client'

import { useState, type FormEvent } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage, query } from '@/lib/client/api'
import { formatCount, formatDate } from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { CreatedSchool, School, SchoolList } from '@/lib/client/types'

/**
 * Tenant administration — SUPER_ADMIN only (`requireSuperAdmin`).
 *
 * Platform administrators onboard schools and control their access status.
 */
export function SchoolsAdmin() {
  const { isSuperAdmin } = useScope()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  const { data, error, loading, refetch } = useApi<SchoolList>(
    `/api/schools${query({ page, pageSize: 20, search: search.trim() || undefined, isActive: status === 'all' ? undefined : status === 'active' })}`,
  )

  async function changeStatus(school: School) {
    setChangingId(school.id)
    setStatusError(null)
    try {
      await api.patch(`/api/schools/${school.id}`, { isActive: !school.isActive })
      setNotice(`${school.name} ${school.isActive ? 'paused' : 'reactivated'}.`)
      if (status !== 'all') setPage(1)
      refetch()
    } catch (error) {
      setStatusError(errorMessage(error))
    } finally {
      setChangingId(null)
    }
  }

  if (!isSuperAdmin) {
    return (
      <Alert tone="danger" title="Not available">
        Only a platform administrator can manage schools.
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
            Schools
          </h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Onboard schools and pause or reactivate their access.
          </p>
        </div>

        <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary shrink-0">
          <Icon name="add" size={20} />
          Onboard a school
        </button>
      </header>

      {notice ? (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}

      {statusError ? <Alert tone="danger">{statusError}</Alert> : null}

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
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
            placeholder="Search by name or slug"
            aria-label="Search schools"
            className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          />
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">School status
          <select className="field w-auto" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
            <option value="all">All schools</option><option value="active">Active</option><option value="paused">Paused</option>
          </select>
        </label>
      </div>

      {error ? (
        <Alert tone="danger" title="Could not load schools">
          {error}
          <button type="button" onClick={refetch} className="mt-3 block font-label-md underline">
            Try again
          </button>
        </Alert>
      ) : null}

      {loading ? (
        <LoadingPanel message="Loading schools…" />
      ) : data && data.schools.length > 0 ? (
        <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
          {data.schools.map((school) => {
            return (
              <div
                key={school.id}
                className="card p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-headline-md text-headline-md text-on-surface">
                      {school.name}
                    </h2>
                    <p className="break-words font-body-md text-body-md text-on-surface-variant">
                      <code>{school.slug}</code>
                      {school.address ? ` · ${school.address}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={school.isActive ? 'success' : 'danger'}>
                      {school.isActive ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border-subtle pt-4">
                  <Stat label="Students" value={school._count.students} />
                  <Stat label="Teachers" value={school._count.users} />
                </dl>

                <p className="mt-4 font-label-sm text-label-sm text-on-surface-variant">
                  Onboarded {formatDate(school.createdAt)}
                </p>

                <button
                  type="button"
                  onClick={() => void changeStatus(school)}
                  disabled={changingId !== null}
                  aria-label={`${school.isActive ? 'Pause school' : 'Reactivate school'}: ${school.name}`}
                  className="btn-secondary mt-4 w-full"
                >
                  <Icon name={school.isActive ? 'pause_circle' : 'play_circle'} size={20} />
                  {changingId === school.id ? 'Saving…' : school.isActive ? 'Pause school' : 'Reactivate school'}
                </button>
              </div>
            )
          })}
        </div>
      ) : data ? (
        <div className="card">
          <EmptyState
            icon="apartment"
            title={search || status !== 'all' ? 'No schools match these filters' : 'No schools yet'}
            description={
              search || status !== 'all' ? 'Try another search or school status.' : 'Onboard the first school to get started.'
            }
            action={
              <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
                <Icon name="add" size={20} />
                Onboard a school
              </button>
            }
          />
        </div>
      ) : null}

      {data && data.meta.totalPages > 1 ? <nav aria-label="School directory pages" className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous schools</button>
        <span className="text-sm">Page {page} of {data.meta.totalPages}</span>
        <button type="button" className="btn-secondary" disabled={loading || page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Next schools</button>
      </nav> : null}

      <p className="font-label-sm text-label-sm text-on-surface-variant">
        A school&apos;s slug cannot be changed after onboarding — offline hall servers cache it
        as their tenant key, and student logins resolve through it.
      </p>

      <CreateSchoolModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false)
          setNotice(`${created.school.name} onboarded, with ${created.school.admin.email} as its school administrator.`)
          setPage(1)
          setSearch('')
          setStatus('all')
          refetch()
        }}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 font-label-md text-label-md text-on-surface">{formatCount(value)}</dd>
    </div>
  )
}

function CreateSchoolModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (created: CreatedSchool) => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [address, setAddress] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

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
      const created = await api.post<CreatedSchool>('/api/schools', {
        name,
        slug,
        // `.strict()` rejects unknown keys, and an empty string fails the URL/length
        // checks — so optional fields are omitted rather than sent blank.
        ...(address.trim() ? { address: address.trim() } : {}),
        admin: { fullName: adminName, email: adminEmail, password: adminPassword },
      })

      setName('')
      setSlug('')
      setAddress('')
      setAdminName('')
      setAdminEmail('')
      setAdminPassword('')
      onCreated(created)
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors())
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Onboard a school" icon="apartment">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div>
          <label htmlFor="school-name" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            School name
          </label>
          <input
            id="school-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              // Suggest a slug, but leave it editable — it is permanent once saved.
              setSlug(slugify(event.target.value))
            }}
            placeholder="e.g. Grace Academy"
            required
            className="field"
          />
          {fieldErrors.name ? (
            <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="school-slug" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            Slug
          </label>
          <input
            id="school-slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="grace-academy"
            required
            className="field"
          />
          {fieldErrors.slug ? (
            <p className="mt-1 font-label-sm text-label-sm text-error">{fieldErrors.slug}</p>
          ) : (
            <p className="mt-1 font-label-sm text-label-sm text-outline">
              Students type this as their school code at login. It cannot be changed later.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="school-address" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
            Address <span className="text-outline">(optional)</span>
          </label>
          <input
            id="school-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="field"
          />
        </div>

        <p className="border-t border-border-subtle pt-4 text-sm text-on-surface-variant">Create the first school administrator to complete onboarding. They will configure and manage the school.</p>
          <div className="space-y-4 rounded-lg bg-surface-container-low p-4">
            <div>
              <label htmlFor="admin-name" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                Administrator name
              </label>
              <input
                id="admin-name"
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
                required
                className="field"
              />
              {fieldErrors['admin.fullName'] ? (
                <p className="mt-1 font-label-sm text-label-sm text-error">
                  {fieldErrors['admin.fullName']}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="admin-email" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                required
                className="field"
              />
              {fieldErrors['admin.email'] ? (
                <p className="mt-1 font-label-sm text-label-sm text-error">
                  {fieldErrors['admin.email']}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                Temporary password
              </label>
              <input
                id="admin-password"
                type="text"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                required
                className="field"
              />
              {fieldErrors['admin.password'] ? (
                <p className="mt-1 font-label-sm text-label-sm text-error">
                  {fieldErrors['admin.password']}
                </p>
              ) : (
                <p className="mt-1 font-label-sm text-label-sm text-outline">
                  At least 10 characters.
                </p>
              )}
            </div>
          </div>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner size={20} /> : <Icon name="apartment" size={20} />}
          {busy ? 'Onboarding…' : 'Onboard school'}
        </button>
      </form>
    </Modal>
  )
}

/** Mirrors `slugSchema`: lowercase, alphanumeric, single hyphens, no leading/trailing dash. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
