'use client'

import { useState } from 'react'
import { errorMessage } from '@/lib/client/api'
import { classLevelLabel } from '@/lib/client/format'
import type { PageMeta } from '@/lib/client/types'
import { Action, Button, DataState, EditForm, Input, Label, PageFrame, option, query, useData, useSmsApi, type Field, type Json } from '@/src/modules/workspace/ui/common'
import type { listParents, parentStudentChoices } from '../service'

type Parents = Json<Awaited<ReturnType<typeof listParents>>>
type Parent = Parents['parents'][number]

export function ParentAccountsScreen() {
  return <PageFrame title="Parent accounts" description="Create phone-and-PIN logins and link parents to their children. Parents can view published results and exchange comments with the child’s form teacher.">{() => <ParentAccountsPanel />}</PageFrame>
}

function ParentAccountsPanel() {
  const api = useSmsApi(), [search, setSearch] = useState(''), [page, setPage] = useState(1)
  const [editor, setEditor] = useState<'new' | 'details' | 'link' | null>(null), [selected, setSelected] = useState(''), [message, setMessage] = useState('')
  const state = useData<Parents>(`parents${query({ page, search, pageSize: 30 })}`)
  const parent = state.data?.parents.find(item => item.id === selected)
  function done(text: string) { setEditor(null); setMessage(text) }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="w-full max-w-md space-y-2"><Label htmlFor="parent-search">Find a parent or child</Label><Input id="parent-search" placeholder="Name, phone or admission number" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setEditor(null); setSelected('') }} /></div>
      <Button onClick={() => { setEditor('new'); setSelected(''); setMessage('') }}>Add parent account</Button>
    </div>
    {state.data?.schoolCode && <p className="text-sm">Parent sign-in uses school code <strong>{state.data.schoolCode}</strong>, their phone number and the PIN you set.</p>}
    <p role="status" className="text-sm">{message}</p>
    {editor === 'new' && <ParentEditor cancel={() => setEditor(null)} done={() => done('Parent account created. Share the school code, phone number and PIN with the parent.')} />}
    {parent && editor === 'details' && <ParentEditor key={parent.id} parent={parent} cancel={() => setEditor(null)} done={() => done('Parent account updated.')} />}
    {parent && editor === 'link' && <ChildLinkEditor parent={parent} cancel={() => setEditor(null)} done={() => done('Child linked to parent.')} />}
    {parent && <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{parent.fullName}</h2><div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditor('details')}>Edit details / reset PIN</Button><Button onClick={() => setEditor('link')}>Link another child</Button>
      </div></div>
      <p className="text-sm text-on-surface-variant">Linked children</p>
      {parent.children.length ? <ul className="space-y-3">{parent.children.map(child => <li key={child.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <span>{child.student.fullName} · {child.student.regNumber}</span>
        <Action label={`Unlink ${child.student.fullName}`} danger run={() => api.post('parents', { op: 'link', parentId: parent.id, studentId: child.student.id, isActive: false })} />
      </li>)}</ul> : <p>No children are linked. Use “Link another child” to give this parent access.</p>}
    </section>}
    <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
      {state.data && <>
        <div className="card overflow-x-auto"><table className="w-full min-w-[680px] text-left">
          <caption className="sr-only">Parent accounts and linked children</caption>
          <thead><tr className="border-b bg-surface-container-low"><th scope="col" className="p-3">Parent</th><th scope="col" className="p-3">Children</th><th scope="col" className="p-3">Status</th><th scope="col" className="p-3">Actions</th></tr></thead>
          <tbody>{state.data.parents.map(item => <tr key={item.id} className="border-b"><th scope="row" className="p-3 font-normal"><strong>{item.fullName}</strong><p className="text-sm text-on-surface-variant">{item.phone}</p></th>
            <td className="p-3">{item.children.map(child => child.student.fullName).join(', ') || 'No linked children'}</td><td className="p-3">{item.isActive ? 'Active' : 'Inactive'}</td>
            <td className="p-3"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setSelected(item.id); setEditor(null) }} aria-label={`Manage ${item.fullName}`}>Manage</Button>
              <Action label={item.isActive ? 'Deactivate' : 'Reactivate'} danger={item.isActive} run={() => api.post('parents', { op: 'update', parentId: item.id, isActive: !item.isActive })} /></div></td>
          </tr>)}</tbody>
        </table>{!state.data.parents.length && <p className="p-6">{search ? 'No parent accounts match your search.' : 'No parent accounts yet. Add a parent account to get started.'}</p>}</div>
        <ParentPagination meta={state.data.meta} onPage={setPage} />
      </>}
    </DataState>
  </div>
}

function StudentSearch({ search, setSearch }: { search: string; setSearch: (value: string) => void }) {
  return <div className="max-w-md space-y-2"><Label htmlFor="link-student-search">Find the child to link</Label><Input id="link-student-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Child’s name or admission number" /></div>
}

function ParentEditor({ parent, cancel, done }: { parent?: Parent; cancel: () => void; done: () => void }) {
  const api = useSmsApi(), [search, setSearch] = useState('')
  const choices = useData<Json<Awaited<ReturnType<typeof parentStudentChoices>>>>(parent ? null : `parent-students${query({ search, pageSize: 50 })}`)
  const fields: Field[] = [
    { name: 'fullName', label: 'Parent’s full name', required: true, value: parent?.fullName },
    { name: 'phone', label: 'Phone number', type: 'tel', required: true, value: parent?.phone },
    { name: 'pin', label: parent ? 'New PIN (leave blank to keep current PIN)' : 'Parent PIN (4–8 digits)', type: 'password', required: !parent },
    ...(!parent ? [{ name: 'studentId', label: 'Child', type: 'select' as const, required: true, options: choices.data?.students.map(child => option(child.id, `${child.fullName} · ${child.regNumber} · ${classLevelLabel(child.classLevel)}`)) ?? [] }] : []),
  ]
  return <section className="space-y-3">
    {!parent && <><StudentSearch search={search} setSearch={setSearch} />{choices.isPending && <p role="status">Loading students…</p>}{choices.error && <p role="alert">{errorMessage(choices.error)}</p>}
      {choices.data && <p className="text-sm text-on-surface-variant">{choices.data.meta.total > 50 ? 'Showing the first 50 matches. Refine the search to find the child.' : `${choices.data.meta.total} students found.`}</p>}</>}
    <EditForm title={parent ? `Edit ${parent.fullName}` : 'New parent account'} fields={fields} cancel={cancel} done={done} submitLabel={parent ? 'Save parent details' : 'Create parent account'}
      save={data => api.post('parents', parent ? { op: 'update', parentId: parent.id, ...data } : data)} />
  </section>
}

function ChildLinkEditor({ parent, cancel, done }: { parent: Parent; cancel: () => void; done: () => void }) {
  const api = useSmsApi(), [search, setSearch] = useState('')
  const choices = useData<Json<Awaited<ReturnType<typeof parentStudentChoices>>>>(`parent-students${query({ search, pageSize: 50 })}`)
  return <section className="space-y-3"><StudentSearch search={search} setSearch={setSearch} />
    {choices.isPending && <p role="status">Loading students…</p>}{choices.error && <p role="alert">{errorMessage(choices.error)}</p>}
    {choices.data && choices.data.meta.total > 50 && <p className="text-sm">Showing the first 50 matches. Search by admission number to find a specific child.</p>}
    <EditForm title={`Link a child to ${parent.fullName}`} cancel={cancel} done={done} submitLabel="Link child" save={data => api.post('parents', { op: 'link', parentId: parent.id, isActive: true, ...data })}
      fields={[{ name: 'studentId', label: 'Child', type: 'select', required: true, options: (choices.data?.students ?? []).filter(child => !parent.children.some(link => link.student.id === child.id)).map(child => option(child.id, `${child.fullName} · ${child.regNumber}`)) }]} />
  </section>
}

export function ParentPagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>{meta.total.toLocaleString()} records · Page {meta.page} of {meta.totalPages}</p>
    {meta.totalPages > 1 && <div className="flex gap-2"><Button variant="outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button><Button variant="outline" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next</Button></div>}
  </div>
}
