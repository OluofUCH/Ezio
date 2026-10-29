'use client'

import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { api, ApiClientError, errorMessage } from '@/lib/client/api'
import { SMS_CONTEXT_HEADER, smsContextKey } from '@/src/modules/shared/context-key'
import { calendarKey, isContextError, useSmsWorkspace, type SmsSchool } from '@/src/modules/shared/ui/SmsWorkspace'
import { CalendarForm } from './CalendarForm'
import { SchoolSelector } from './SchoolSelector'
import { calendarDateLabel, type CalendarResponse } from './types'

export function CalendarScreen() {
  const { user, school, switching, scopeProblem } = useSmsWorkspace()
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-primary">School setup</p>
        <h1 className="mt-1 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">Academic calendar</h1>
        <p className="mt-2 max-w-2xl text-on-surface-variant">Set up academic sessions and the terms within them.</p>
      </header>
      {user.role === 'SUPER_ADMIN' ? <SchoolSelector /> : <p className="text-sm text-on-surface-variant">Managing <strong className="text-on-surface">{school?.name}</strong></p>}
      {switching ? <div role="status" className="flex items-center gap-3 py-8"><Spinner size={20} decorative />Switching school…</div>
        : scopeProblem ? <CalendarProblem message={scopeProblem} reload />
          : school ? <CalendarPanel key={`${user.id}:${school.id}`} school={school} />
            : <div className="card p-6 text-on-surface-variant">Choose a school above to view and set up its academic calendar.</div>}
    </div>
  )
}

function CalendarProblem({ message, reload = false, retry }: { message: string; reload?: boolean; retry?: () => void }) {
  return <section role="alert" className="card space-y-3 p-6">
    <h2 className="font-semibold text-on-surface">Could not load the calendar</h2>
    <p className="text-sm text-error">{message}</p>
    <Button variant="outline" onClick={reload ? () => window.location.reload() : retry}>{reload ? 'Reload school' : 'Retry calendar'}</Button>
  </section>
}

function CalendarPanel({ school }: { school: SmsSchool }) {
  const { user } = useSmsWorkspace()
  const addSession = useRef<HTMLButtonElement>(null)
  const [editor, setEditor] = useState<'session' | { sessionId: string } | null>(null)
  const [notice, setNotice] = useState('')
  const calendar = useQuery({
    queryKey: calendarKey(user.id, school.id),
    queryFn: async ({ signal }) => {
      const response = await api.get<CalendarResponse>('/api/sms/staff/academic-sessions', {
        signal, headers: { [SMS_CONTEXT_HEADER]: smsContextKey(user.id, school.id) },
      })
      if (response.schoolId !== school.id) throw new ApiClientError(409, { code: 'CONFLICT', message: 'The selected school changed. Reload before continuing.', details: { reason: 'SCHOOL_SCOPE_CHANGED' } })
      return response.sessions
    },
  })

  function finish(message = '') {
    const target = editor && editor !== 'session' ? `add-term-${editor.sessionId}` : null
    setEditor(null)
    setNotice(message)
    requestAnimationFrame(() => {
      if (target) document.getElementById(target)?.focus()
      else addSession.current?.focus()
    })
  }

  if (calendar.isPending) return <div role="status" className="flex items-center gap-3 py-8"><Spinner size={20} decorative />Loading academic calendar…</div>
  if (calendar.isError) return <CalendarProblem message={errorMessage(calendar.error)} reload={isContextError(calendar.error)} retry={() => void calendar.refetch()} />

  return (
    <section aria-label="Academic sessions" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-on-surface">Academic sessions <span className="text-base font-normal text-on-surface-variant">({calendar.data.length})</span></h2>
        <Button ref={addSession} disabled={editor !== null} onClick={() => { setNotice(''); setEditor('session') }}><Icon name="add" size={18} />Add session</Button>
      </div>
      <p role="status" className="min-h-6 text-sm text-primary">{notice}</p>
      {editor === 'session' ? <CalendarForm school={school} onDone={finish} onCancel={() => finish()} /> : null}
      {!calendar.data.length ? <div className="card p-6">
        <h3 className="font-semibold text-on-surface">No academic sessions yet</h3>
        <p className="mt-2 text-sm text-on-surface-variant">Add a session, then add its terms and dates.</p>
      </div> : calendar.data.map((session) => (
        <article key={session.id} className="card space-y-4 p-4 sm:p-6" aria-labelledby={`session-${session.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h3 id={`session-${session.id}`} className="break-words text-lg font-semibold text-on-surface">{session.name}</h3>
              <p className="text-sm text-on-surface-variant">{calendarDateLabel(session.startDate)} – {calendarDateLabel(session.endDate)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${session.isCurrent ? 'bg-primary-container/20 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>{session.isCurrent ? 'Current session' : 'Not current'}</span>
          </div>
          {session.terms.length ? <ol className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {session.terms.map((term) => <li key={term.id} className="flex flex-col justify-between gap-1 p-3 sm:flex-row sm:gap-4">
              <span className="min-w-0 break-words text-sm font-medium text-on-surface">{term.orderIndex}. {term.name}</span>
              <span className="text-sm text-on-surface-variant">{calendarDateLabel(term.startDate)} – {calendarDateLabel(term.endDate)}</span>
            </li>)}
          </ol> : <p className="text-sm text-on-surface-variant">No terms added to this session.</p>}
          {editor && editor !== 'session' && editor.sessionId === session.id
            ? <CalendarForm school={school} session={session} onDone={finish} onCancel={() => finish()} />
            : <Button id={`add-term-${session.id}`} variant="outline" disabled={editor !== null} onClick={() => { setNotice(''); setEditor({ sessionId: session.id }) }}><Icon name="add" size={18} />Add term<span className="sr-only"> to {session.name}</span></Button>}
        </article>
      ))}
    </section>
  )
}
