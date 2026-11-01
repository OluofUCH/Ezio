'use client'

import { useId, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/lib/client/api'
import { classLevelLabel } from '@/lib/client/format'
import type { ClassLevel } from '@/lib/core/domain'
import { Spinner } from '@/components/ui/Spinner'
import { Button, DataState, Input, Label, PageFrame, useData, useSmsApi, type Lookup } from '@/src/modules/workspace/ui/common'
import { ANNOUNCEMENT_AUDIENCES, AUDIENCE_LABELS, needsClassArm, type AnnouncementAudience } from '../audiences'

type Notice = { id: string; title: string; body: string; audience: AnnouncementAudience; targetRole: string | null; createdAt: string; author: { fullName: string }; classArm: { level: ClassLevel; name: string } | null }
const selectClass = 'min-h-11 w-full min-w-0 rounded-lg border border-outline bg-surface px-3 py-2'

export function AnnouncementsScreen() {
  const { user } = useSmsApi(), admin = user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN'
  return <PageFrame title={admin ? 'School notices' : 'Staff notices'} description={admin ? 'Send updates to staff, all parents, or the parents of a selected class arm.' : 'Read notices addressed to you and your classes.'}>{() => <NoticePanel canPost={admin} />}</PageFrame>
}

export function ParentNoticesScreen() {
  return <PageFrame title="School notices" description="Read updates from your school and notices for your children’s classes.">{() => <NoticePanel />}</PageFrame>
}

function NoticePanel({ canPost = false }: { canPost?: boolean }) {
  const state = useData<{ announcements: Notice[] }>('announcements')
  const [editor, setEditor] = useState(false), [posted, setPosted] = useState(false)
  return <div className="space-y-5">
    {canPost && !editor && <Button onClick={() => { setEditor(true); setPosted(false) }}>Post notice</Button>}
    {editor && <NoticeForm close={() => setEditor(false)} done={() => { setEditor(false); setPosted(true) }} />}
    <p role="status" className="text-sm">{posted ? 'Notice posted.' : ''}</p>
    <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
      {state.data?.announcements.length ? state.data.announcements.map(notice => <article key={notice.id} className="card space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-xl font-semibold">{notice.title}</h2><span className="text-sm text-on-surface-variant">{AUDIENCE_LABELS[notice.audience]}{notice.classArm ? ` · ${classLevelLabel(notice.classArm.level)} ${notice.classArm.name}` : notice.targetRole ? ` · ${notice.targetRole.replaceAll('_', ' ')}` : ''}</span></div>
        <p className="whitespace-pre-wrap break-words">{notice.body}</p>
        <p className="text-sm text-on-surface-variant">{notice.author.fullName} · <time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</time></p>
      </article>) : <p className="card p-6">{canPost ? 'No notices yet. Select Post notice to send an update.' : 'No notices for you yet.'}</p>}
    </DataState>
  </div>
}

function NoticeForm({ close, done }: { close: () => void; done: () => void }) {
  const api = useSmsApi(), client = useQueryClient(), id = useId(), lookup = useData<Lookup>('lookups')
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [audience, setAudience] = useState(''), [targetRole, setTargetRole] = useState(''), [classArmId, setClassArmId] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await api.post('announcements', { title, body, audience, targetRole: audience === 'ROLE' ? targetRole : null, classArmId: needsClassArm(audience) ? classArmId : null })
      await client.invalidateQueries({ queryKey: api.key }); done()
    } catch (failure) { if (!api.reportContextError(failure)) setError(errorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} aria-busy={busy} className="card space-y-4 p-5">
    <h2 className="text-xl font-semibold">New school notice</h2>
    <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2"><legend className="sr-only">Notice details and audience</legend>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-title`}>Title</Label><Input id={`${id}-title`} value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor={`${id}-body`}>Message</Label><textarea id={`${id}-body`} value={body} onChange={event => setBody(event.target.value)} required maxLength={10000} rows={5} className="w-full rounded-lg border border-outline bg-surface p-3" /></div>
      <div className="space-y-2"><Label htmlFor={`${id}-audience`}>Audience</Label><select id={`${id}-audience`} required value={audience} onChange={event => { setAudience(event.target.value); setTargetRole(''); setClassArmId('') }} className={selectClass}>
        <option value="">Choose an audience</option>{ANNOUNCEMENT_AUDIENCES.map(value => <option key={value} value={value}>{AUDIENCE_LABELS[value]}</option>)}
      </select></div>
      {audience === 'ROLE' && <div className="space-y-2"><Label htmlFor={`${id}-role`}>Staff role</Label><select id={`${id}-role`} required value={targetRole} onChange={event => setTargetRole(event.target.value)} className={selectClass}><option value="">Choose a role</option><option value="SCHOOL_ADMIN">School admins</option><option value="TEACHER">Teachers</option></select></div>}
      {needsClassArm(audience) && <div className="space-y-2"><Label htmlFor={`${id}-arm`}>Class arm</Label><select id={`${id}-arm`} required value={classArmId} onChange={event => setClassArmId(event.target.value)} className={selectClass}>
        <option value="">{lookup.isPending ? 'Loading classes…' : 'Choose a class arm'}</option>{lookup.data?.arms.map(arm => <option key={arm.id} value={arm.id}>{classLevelLabel(arm.level as ClassLevel)} {arm.name}</option>)}
      </select>{lookup.error && <p role="alert" className="text-sm text-error">{errorMessage(lookup.error)}</p>}</div>}
      {error && <p role="alert" className="text-sm text-error sm:col-span-2">{error}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit">{busy && <Spinner decorative size={16} />}Post notice</Button><Button variant="outline" onClick={close}>Cancel</Button></div>
    </fieldset>
  </form>
}
