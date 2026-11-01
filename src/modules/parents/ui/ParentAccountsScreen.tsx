'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { PageMeta } from '@/lib/client/types'
import { Action, Button, DataState, EditForm, Input, Label, PageFrame, query, useData, useSmsApi, type Json } from '@/src/modules/workspace/ui/common'
import type { listParents } from '../service'
import { DEFAULT_PARENT_PIN } from '../rules'

type Parents = Json<Awaited<ReturnType<typeof listParents>>>

export function ParentAccountsScreen() {
  return <PageFrame title="Parent accounts" description="Accounts are created automatically from student guardian details. Review linked children, update contact details, reset PINs and manage access.">{() => <ParentAccountsPanel />}</PageFrame>
}

function ParentAccountsPanel() {
  const api = useSmsApi(), [search, setSearch] = useState(''), [page, setPage] = useState(1)
  const [selected, setSelected] = useState(''), [message, setMessage] = useState('')
  const state = useData<Parents>(`parents${query({ page, search, pageSize: 30 })}`)
  const parent = state.data?.parents.find(item => item.id === selected)
  return <div className="space-y-5">
    <section className="card space-y-2 p-5">
      <p>Add a guardian’s name and phone number when admitting a student or editing their profile. Matching guardian phone numbers in this school share one parent account.</p>
      <p className="text-sm text-on-surface-variant">New parent accounts start with PIN <strong>{DEFAULT_PARENT_PIN}</strong>. Linking another child keeps the existing PIN.</p>
      <Link className="btn-secondary" href="/sms/staff/students">Open student profiles</Link>
    </section>
    <div className="max-w-md space-y-2"><Label htmlFor="parent-search">Find a parent or child</Label><Input id="parent-search" placeholder="Name, phone or admission number" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setSelected('') }} /></div>
    {state.data?.schoolCode && <p className="text-sm">Parent sign-in uses school code <strong>{state.data.schoolCode}</strong>, the guardian’s phone number and their PIN.</p>}
    <p role="status" className="text-sm">{message}</p>
    {parent && <EditForm key={parent.id} title={`Edit ${parent.fullName}`} cancel={() => setSelected('')} done={() => { setSelected(''); setMessage('Parent account updated.') }} submitLabel="Save parent details"
      save={data => api.post('parents', { op: 'update', parentId: parent.id, ...data })} fields={[
        { name: 'fullName', label: 'Parent’s full name', required: true, value: parent.fullName },
        { name: 'phone', label: 'Phone number', type: 'tel', required: true, value: parent.phone },
        { name: 'pin', label: 'New PIN (leave blank to keep current PIN)', type: 'password' },
      ]} />}
    <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
      {state.data && <>
        <div className="card overflow-x-auto"><table className="w-full min-w-[680px] text-left">
          <caption className="sr-only">Parent accounts and linked children</caption>
          <thead><tr className="border-b bg-surface-container-low"><th scope="col" className="p-3">Parent</th><th scope="col" className="p-3">Children</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Actions</th></tr></thead>
          <tbody>{state.data.parents.map(item => <tr key={item.id} className="border-b"><th scope="row" className="p-3 font-normal"><strong>{item.fullName}</strong><p className="text-sm text-on-surface-variant">{item.phone}</p></th>
            <td className="p-3">{item.children.map(child => child.student.fullName).join(', ') || 'No linked children'}</td><td className="p-3">{item.isActive ? 'Active' : 'Inactive'}</td>
            <td className="p-3"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelected(item.id)} aria-label={`Edit details / reset PIN for ${item.fullName}`}>Edit details / reset PIN</Button>
              <Action label={item.isActive ? 'Deactivate' : 'Reactivate'} danger={item.isActive} run={() => api.post('parents', { op: 'update', parentId: item.id, isActive: !item.isActive })} /></div></td>
          </tr>)}</tbody>
        </table>{!state.data.parents.length && <p className="p-6">{search ? 'No parent accounts match your search.' : 'No parent accounts yet. Add guardian names and phone numbers to student profiles to create them automatically.'}</p>}</div>
        <ParentPagination meta={state.data.meta} onPage={setPage} />
      </>}
    </DataState>
  </div>
}

export function ParentPagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{meta.total.toLocaleString()} records · Page {meta.page} of {meta.totalPages}</p>
    {meta.totalPages > 1 && <div className="flex gap-2"><Button variant="outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button><Button variant="outline" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next</Button></div>}
  </div>
}
