'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/lib/client/api'
import { Spinner } from '@/components/ui/Spinner'
import { Button, DataState, Label, query, useData, useSmsApi, type Json } from '@/src/modules/workspace/ui/common'
import type { listComments } from '../service'

type Thread = Json<Awaited<ReturnType<typeof listComments>>>

export function CommentThread({ parentStudentId, staff = false }: { parentStudentId: string; staff?: boolean }) {
  const api = useSmsApi(), client = useQueryClient(), id = useId()
  const input = useRef<HTMLTextAreaElement>(null)
  const [page, setPage] = useState(1), [body, setBody] = useState(''), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [sent, setSent] = useState(false)
  const [bodyError, setBodyError] = useState('')
  const area = staff ? 'parent-comments' : 'comments'
  const state = useData<Thread>(`${area}${query({ parentStudentId, page, pageSize: 50 })}`)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!body.trim()) { setBodyError('Write a comment.'); input.current?.focus(); return }
    setBodyError('')
    setBusy(true); setError(''); setSent(false)
    try {
      await api.post(area, { parentStudentId, body })
      setBody(''); setPage(1); setSent(true)
      await client.invalidateQueries({ queryKey: api.key })
    } catch (failure) {
      if (!api.reportContextError(failure)) setError(errorMessage(failure))
    } finally { setBusy(false) }
  }

  return <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
    {state.data && <section className="card space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-semibold">{state.data.family.student.fullName}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{staff ? `Parent: ${state.data.family.parent.fullName}` : `Form teacher: ${state.data.family.formTeacher?.fullName ?? 'Not yet assigned'}`}</p></div>
        <Button variant="outline" disabled={state.isFetching} onClick={() => void state.refetch()}>Refresh comments</Button>
      </div>
      {state.data.comments.length ? <ol className="space-y-3" aria-label="Conversation">
        {state.data.comments.map(comment => <li key={comment.id} className={`rounded-lg border p-4 ${comment.author === 'TEACHER' ? 'bg-surface-container-low' : 'bg-surface'}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <strong>{comment.authorName} · {comment.author === 'TEACHER' ? 'Teacher' : 'Parent'}</strong>
            <time dateTime={comment.createdAt} className="text-on-surface-variant">{new Date(comment.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</time>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words">{comment.body}</p>
        </li>)}
      </ol> : <p className="text-on-surface-variant">No comments yet. Start a conversation about this child.</p>}
      {state.data.meta.totalPages > 1 && <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer comments</Button>
        <span className="text-sm">Page {page} of {state.data.meta.totalPages}</span>
        <Button variant="outline" disabled={page >= state.data.meta.totalPages} onClick={() => setPage(page + 1)}>Older comments</Button>
      </div>}
      {state.data.family.formTeacher ? <form onSubmit={submit} className="space-y-3 border-t pt-5" aria-busy={busy}>
        <Label htmlFor={id}>Your comment</Label>
        <textarea ref={input} id={id} value={body} onChange={event => { setBody(event.target.value); setSent(false); setBodyError('') }} required maxLength={2000} rows={4} disabled={busy}
          className="block w-full rounded-lg border border-outline bg-surface p-3" aria-invalid={Boolean(bodyError)} aria-describedby={`${id}-limit${bodyError ? ` ${id}-error` : ''}`} />
        <p id={`${id}-limit`} className="text-sm text-on-surface-variant">{body.length.toLocaleString()} / 2,000 characters</p>
        {bodyError && <p id={`${id}-error`} className="text-sm text-error">{bodyError}</p>}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <p role="status" className="text-sm">{sent ? 'Comment sent.' : ''}</p>
        <Button type="submit" disabled={busy}>{busy && <Spinner decorative size={16} />}Send comment</Button>
      </form> : <p className="border-t pt-4 text-sm text-on-surface-variant">Contact the school office to assign a form teacher to this child’s current class. You can send comments once a form teacher is assigned.</p>}
    </section>}
  </DataState>
}
