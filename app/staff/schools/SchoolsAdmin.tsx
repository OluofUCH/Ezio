'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { LoadingPanel, Spinner } from '@/components/ui/Spinner'
import { useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage, query } from '@/lib/client/api'
import { formatCount, formatDate } from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { CreatedSchool, SchoolList } from '@/lib/client/types'

/**
 * Tenant administration — SUPER_ADMIN only (`requireSuperAdmin`).
 *
 * Doubles as the school picker. A platform admin has no school of their own, so every
 * school-scoped page needs them to choose one first; selecting here is what fills in the
 * `?schoolId=` that `requireSchoolScope` demands of their role.
 */
export function SchoolsAdmin() {
  const router = useRouter()
  const { isSuperAdmin, schoolId, setActiveSchool } = useScope()

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const { data, error, loading, refetch } = useApi<SchoolList>(
    `/api/schools${query({ pageSize: 100, search: search.trim() || undefined })}`,
  )

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
            Every tenant on the platform. Pick one to work inside it.
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
            placeholder="Search by name or slug"
            aria-label="Search schools"
            className="w-full rounded-full border-none bg-surface-container py-2 pl-10 pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary-container"
          />
        </div>
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
            const active = school.id === schoolId

            return (
              <div
                key={school.id}
                className={`card p-6 ${active ? 'border-primary-container ring-2 ring-primary-container/30' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-headline-md text-headline-md text-on-surface">
                      {school.name}
                    </h2>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      <code>{school.slug}</code>
                      {school.address ? ` · ${school.address}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge tone={school.isActive ? 'success' : 'danger'}>
                      {school.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {active ? <Badge tone="primary">Selected</Badge> : null}
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-4 gap-3 border-t border-border-subtle pt-4">
                  <Stat label="Students" value={school._count.students} />
                  <Stat label="Staff" value={school._count.users} />
                  <Stat label="Exams" value={school._count.exams} />
                  <Stat label="Servers" value={school._count.localServers} />
                </dl>

                <p className="mt-4 font-label-sm text-label-sm text-on-surface-variant">
                  Onboarded {formatDate(school.createdAt)}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSchool(school.id, school.name)
                    router.push('/staff')
                  }}
                  className="btn-primary mt-4 w-full"
                >
                  <Icon name="login" size={20} />
                  {active ? 'Continue in this school' : 'Work in this school'}
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="apartment"
            title={search ? 'No schools match that search' : 'No schools yet'}
            description={
              search ? 'Try a different name or slug.' : 'Onboard the first school to get started.'
            }
            action={
              <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary">
                <Icon name="add" size={20} />
                Onboard a school
              </button>
            }
          />
        </div>
      )}

      <p className="font-label-sm text-label-sm text-on-surface-variant">
        A school&apos;s slug cannot be changed after onboarding — offline hall servers cache it
        as their tenant key, and student logins resolve through it.
      </p>

      <CreateSchoolModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false)
          setNotice(
            created.school.admin
              ? `${created.school.name} onboarded, with ${created.school.admin.email} as its school administrator.`
              : `${created.school.name} onboarded. It has no administrator yet, so nobody can sign in to it.`,
          )
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
  const [withAdmin, setWithAdmin] = useState(true)
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
        ...(withAdmin
          ? { admin: { fullName: adminName, email: adminEmail, password: adminPassword } }
          : {}),
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

        <label className="flex cursor-pointer items-start gap-3 border-t border-border-subtle pt-4">
          <input
            type="checkbox"
            checked={withAdmin}
            onChange={(event) => setWithAdmin(event.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[#4a6700]"
          />
          <span>
            <span className="block font-label-md text-label-md text-on-surface">
              Create its first school administrator
            </span>
            <span className="block font-label-sm text-label-sm text-on-surface-variant">
              Without one, nobody can sign in to the school. Created in the same transaction.
            </span>
          </span>
        </label>

        {withAdmin ? (
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
        ) : null}

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
