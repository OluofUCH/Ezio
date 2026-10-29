'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/Spinner'
import { api, errorMessage, query } from '@/lib/client/api'
import type { PageMeta } from '@/lib/client/types'
import { schoolDataPrefix, useSmsWorkspace, type SmsSchool } from '@/src/modules/shared/ui/SmsWorkspace'

type Directory = { schools: SmsSchool[]; meta: PageMeta }

export function SchoolSelector() {
  const router = useRouter()
  const workspace = useSmsWorkspace()
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(!workspace.school)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [candidate, setCandidate] = useState('')
  const [notice, setNotice] = useState('')
  const writes = useIsMutating({ mutationKey: schoolDataPrefix(workspace.user.id) })
  const directory = useQuery({
    queryKey: ['sms', workspace.user.id, 'schools', search, page],
    queryFn: ({ signal }) => api.get<Directory>(`/api/schools${query({ search, page, pageSize: 20 })}`, { signal }),
    enabled: open && workspace.user.role === 'SUPER_ADMIN',
  })
  const select = useMutation({
    mutationKey: ['sms', workspace.user.id, 'school-selection'],
    mutationFn: (schoolId: string) => api.post<{ school: SmsSchool }>('/api/sms/staff/school-context', { schoolId }),
    onMutate: workspace.beginSelection,
    onSuccess: ({ school }) => {
      workspace.finishSelection(school)
      // Invalidate prefetched CBT layouts so they receive this same signed selection.
      router.refresh()
      setNotice(`Selected ${school.name}.`)
      setOpen(false)
      setCandidate('')
      requestAnimationFrame(() => trigger.current?.focus())
    },
    onError: (error) => {
      workspace.cancelSelection()
      workspace.reportContextError(error)
    },
  })
  const busy = select.isPending || workspace.switching || writes > 0

  function searchSchools(event: FormEvent) {
    event.preventDefault()
    setSearch(draft.trim())
    setPage(1)
    setCandidate('')
  }

  return (
    <section className="card space-y-4 p-4 sm:p-6" aria-label="School selection">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-on-surface-variant">School</p>
          <p className="break-words font-semibold text-on-surface">{workspace.school?.name ?? 'Choose a school'}</p>
          {workspace.school && !workspace.school.isActive ? <p className="text-sm text-on-surface-variant">Inactive school</p> : null}
        </div>
        {!open ? <Button ref={trigger} variant="outline" disabled={busy} onClick={() => { setOpen(true); select.reset() }}>Change school</Button> : null}
      </div>
      <p role="status" className="sr-only">{notice}</p>
      {open ? (
        <div className="space-y-4 border-t border-border-subtle pt-4">
          <form onSubmit={searchSchools} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor={`${id}-search`}>Find a school</Label>
              <Input id={`${id}-search`} name="schoolSearch" type="search" autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} />
            </div>
            <Button type="submit" variant="outline" disabled={busy}>Search</Button>
          </form>
          <p role="status" className="text-sm text-on-surface-variant">
            {directory.isFetching ? 'Loading schools…' : directory.data ? `${directory.data.meta.total} school${directory.data.meta.total === 1 ? '' : 's'} found.` : ''}
          </p>
          {directory.isError ? (
            <div role="alert" className="space-y-3 text-sm text-error">
              <p>{errorMessage(directory.error)}</p>
              <Button variant="outline" onClick={() => void directory.refetch()}>Retry school list</Button>
            </div>
          ) : directory.data?.schools.length ? (
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); select.mutate(candidate) }}>
              <div className="space-y-2">
                <Label htmlFor={`${id}-school`}>School to manage</Label>
                <select id={`${id}-school`} name="school" required value={candidate} onChange={(event) => setCandidate(event.target.value)} disabled={busy || directory.isFetching}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-outline bg-surface px-3 py-2 text-base text-on-surface focus-visible:[outline:revert] disabled:opacity-50">
                  <option value="">Select a school</option>
                  {directory.data.schools.map((school) => <option key={school.id} value={school.id}>{school.name}{school.isActive ? '' : ' (inactive)'}</option>)}
                </select>
              </div>
              {select.isError ? <p role="alert" className="text-sm text-error">{errorMessage(select.error)}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={busy || directory.isFetching}>{select.isPending ? <Spinner size={16} decorative /> : null}Use this school</Button>
                {workspace.school ? <Button variant="ghost" disabled={busy} onClick={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) }}>Cancel</Button> : null}
              </div>
              {directory.data.meta.totalPages > 1 ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" disabled={busy || directory.isFetching || page <= 1} onClick={() => { setPage(page - 1); setCandidate('') }}>Previous schools</Button>
                  <span className="text-sm">Page {page} of {directory.data.meta.totalPages}</span>
                  <Button variant="outline" disabled={busy || directory.isFetching || page >= directory.data.meta.totalPages} onClick={() => { setPage(page + 1); setCandidate('') }}>Next schools</Button>
                </div>
              ) : null}
            </form>
          ) : directory.data ? (
            <div className="space-y-3 text-sm text-on-surface-variant">
              <p>{search ? 'No schools match this search.' : 'Add a school before setting up its calendar.'}</p>
              <Button asChild variant="outline"><Link href="/staff/schools">Manage schools</Link></Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
