'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CLASS_LEVELS } from '@/lib/core/domain'
import { classLevelLabel } from '@/lib/client/format'
import { errorMessage } from '@/lib/client/api'
import { DataState, Input, Label, PageFrame, Picker, option, query, termsOf, useData, useSmsApi, type Json, type Lookup } from '@/src/modules/workspace/ui/common'
import type { feeRegister } from '../service'

type Register = Json<Awaited<ReturnType<typeof feeRegister>>>

export function FeesScreen() {
  return <PageFrame title="Fees" description="Record whether each student’s fees are paid or owing for the selected term.">{() => <FeesLookup />}</PageFrame>
}

function FeesLookup() {
  const state = useData<Lookup>('lookups')
  return <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>{state.data && <FeesPanel lookup={state.data} />}</DataState>
}

function FeesPanel({ lookup }: { lookup: Lookup }) {
  const api = useSmsApi(), admin = api.user.role === 'SCHOOL_ADMIN'
  const terms = termsOf(lookup), currentSession = lookup.sessions.find(session => session.isCurrent)
  const today = new Date().toISOString().slice(0, 10)
  const initialTerm = terms.find(term => term.academicSessionId === currentSession?.id && term.startDate.slice(0, 10) <= today && term.endDate.slice(0, 10) >= today)
    ?? terms.find(term => term.academicSessionId === currentSession?.id) ?? terms[0]
  const [term, setTerm] = useState(initialTerm?.id ?? ''), [level, setLevel] = useState('ALL'), [arm, setArm] = useState('ALL')
  const [status, setStatus] = useState('ALL'), [search, setSearch] = useState('')
  const arms = admin ? lookup.arms : lookup.arms.filter(item => item.formTeacherId === api.user.id)
  const availableArms = arms.filter(item => level === 'ALL' || item.level === level)
  const levels = admin ? CLASS_LEVELS : CLASS_LEVELS.filter(value => arms.some(item => item.level === value))
  const path = term && (admin || arms.length) ? `fees${query({ termId: term, classLevel: level !== 'ALL' ? level : undefined, classArmId: arm !== 'ALL' ? arm : undefined })}` : null
  const state = useData<Register>(path)
  const searchKey = search.trim().toLowerCase()
  const rows = state.data?.rows.filter(row => (status === 'ALL' || row.status === status) && (!searchKey || `${row.student.fullName} ${row.student.regNumber}`.toLowerCase().includes(searchKey))) ?? []

  return <div className="space-y-5">
    {!admin && !arms.length ? <p className="card p-6">You have no form class assigned. Ask the school administrator to assign your form class.</p> : <>
      <section className="card grid gap-4 p-5 md:grid-cols-3">
        <Picker label="Term" value={term} onChange={setTerm} options={terms.map(item => option(item.id, item.label))} />
        <Picker label="Class level" value={level} onChange={value => { setLevel(value || 'ALL'); setArm('ALL') }} options={[option('ALL', admin ? 'All class levels' : 'All my form classes'), ...levels.map(value => option(value, classLevelLabel(value)))]} />
        <Picker label="Class arm" value={arm} onChange={value => setArm(value || 'ALL')} options={[option('ALL', 'All arms'), ...availableArms.map(item => option(item.id, `${classLevelLabel(item.level as Parameters<typeof classLevelLabel>[0])} ${item.name}`))]} />
      </section>
      <p className="text-sm text-on-surface-variant">Students start as Owing each term. Mark Paid after the school confirms payment. Each change is saved automatically.</p>
      {!term ? <p className="card p-6">Choose a term to view fees. If no terms are available, ask the school administrator to set up the academic calendar.</p> : <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
        {state.data && <>
          <dl className="grid gap-4 sm:grid-cols-3">{([
            ['Students in selected classes', state.data.totals.students], ['Paid', state.data.totals.paid], ['Owing', state.data.totals.owing],
          ] as const).map(([label, count]) => <div key={label} className="card p-5"><dt className="text-sm text-on-surface-variant">{label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{count.toLocaleString()}</dd></div>)}</dl>
          <section className="card space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Picker label="Fee status" value={status} onChange={value => setStatus(value || 'ALL')} options={[option('ALL', 'All students'), option('PAID', 'Paid'), option('OWING', 'Owing')]} />
              <div className="space-y-2"><Label htmlFor="fees-search">Find a student</Label><Input id="fees-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or admission number" /></div>
            </div>
            <p className="text-sm" role="status">{rows.length.toLocaleString()} students shown · {state.data.term.session} · {state.data.term.name}</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Student fee status for {state.data.term.session}, {state.data.term.name}</caption>
              <thead><tr className="border-b"><th scope="col" className="p-3">Student</th><th scope="col" className="p-3">Class</th><th scope="col" className="p-3">Fees paid</th><th scope="col" className="p-3">Last updated</th></tr></thead>
              <tbody>{rows.map(row => <tr key={row.student.id} className="border-b">
                <th scope="row" className="p-3 font-normal"><strong>{row.student.fullName}</strong><p className="text-sm text-on-surface-variant">{row.student.regNumber}</p></th>
                <td className="p-3">{classLevelLabel(row.classArm.level)} {row.classArm.name}</td>
                <td className="p-3"><FeeToggle key={`${term}:${row.student.id}`} termId={term} row={row} /></td>
                <td className="p-3 text-sm text-on-surface-variant">{row.updatedAt ? <><p>{row.updatedBy}</p><time dateTime={row.updatedAt}>{new Date(row.updatedAt).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</time></> : 'Not yet recorded'}</td>
              </tr>)}</tbody>
            </table></div>
            {!rows.length && <p className="py-4 text-on-surface-variant">{state.data.rows.length ? 'No students match these filters.' : 'No enrolled students found for the selected class and term.'}</p>}
          </section>
        </>}
      </DataState>}
    </>}
  </div>
}

function FeeToggle({ termId, row }: { termId: string; row: Register['rows'][number] }) {
  const api = useSmsApi(), client = useQueryClient(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const paid = row.status === 'PAID'
  async function toggle() {
    if (busy) return
    setBusy(true); setError('')
    try {
      await api.post('fees', { termId, studentId: row.student.id, classArmId: row.classArm.id, status: paid ? 'OWING' : 'PAID' })
      await client.invalidateQueries({ queryKey: api.key })
    } catch (failure) { if (!api.reportContextError(failure)) setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <div className="space-y-1">
    <button type="button" role="switch" aria-checked={paid} aria-label={`Fees paid for ${row.student.fullName} (${row.student.regNumber})`} disabled={busy} onClick={() => void toggle()}
      className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-outline-variant px-3 py-2 font-semibold disabled:opacity-60">
      <span aria-hidden className={`relative h-6 w-11 rounded-full ${paid ? 'bg-primary' : 'bg-outline'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${paid ? 'translate-x-6' : 'translate-x-1'} left-0`} /></span>
      <span>{busy ? 'Saving…' : paid ? 'Paid' : 'Owing'}</span>
    </button>
    {error && <p role="alert" className="max-w-xs text-sm text-error">{error}</p>}
  </div>
}
