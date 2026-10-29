'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/Spinner'
import { api, ApiClientError, errorMessage } from '@/lib/client/api'
import { SMS_CONTEXT_HEADER, smsContextKey } from '@/src/modules/shared/context-key'
import { calendarKey, useSmsWorkspace, type SmsSchool } from '@/src/modules/shared/ui/SmsWorkspace'
import { createAcademicSessionSchema, createTermSchema, type CreateAcademicSessionInput, type CreateTermInput } from '../calendar-validation'
import type { CalendarSession } from './types'

type Props = { school: SmsSchool; session?: CalendarSession; onDone: (message: string) => void; onCancel: () => void }

export function CalendarForm({ school, session, onDone, onCancel }: Props) {
  const { user, reportContextError } = useSmsWorkspace()
  const queryClient = useQueryClient()
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => { first.current?.focus() }, [])

  function focusError(fields: Record<string, string>) {
    requestAnimationFrame(() => {
      const name = Object.keys(fields)[0]
      const element = name ? form.current?.elements.namedItem(name) : null
      if (element instanceof HTMLElement) element.focus()
    })
  }

  const save = useMutation({
    mutationKey: [...calendarKey(user.id, school.id), 'create'],
    mutationFn: (input: CreateAcademicSessionInput | CreateTermInput) => api.post(
      session ? `/api/sms/staff/academic-sessions/${encodeURIComponent(session.id)}/terms` : '/api/sms/staff/academic-sessions',
      input, { headers: { [SMS_CONTEXT_HEADER]: smsContextKey(user.id, school.id) } },
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: calendarKey(user.id, school.id) })
      onDone(session ? 'Term added.' : 'Academic session added.')
    },
    onError: (error) => {
      if (reportContextError(error)) return
      setFailure(errorMessage(error))
      const fields = error instanceof ApiClientError ? error.fieldErrors() : {}
      setErrors(fields)
      focusError(fields)
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFailure(null)
    setErrors({})
    const fields = new FormData(event.currentTarget)
    const input = { name: fields.get('name'), startDate: fields.get('startDate'), endDate: fields.get('endDate') }
    const parsed = session
      ? createTermSchema.safeParse({ ...input, orderIndex: Number(fields.get('orderIndex')) })
      : createAcademicSessionSchema.safeParse(input)
    if (!parsed.success) {
      const messages = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
      setErrors(messages)
      focusError(messages)
      return
    }
    save.mutate(parsed.data)
  }

  const errorProps = (name: string) => ({ 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `${id}-${name}-error` : undefined })
  const fieldError = (name: string) => errors[name] ? <p id={`${id}-${name}-error`} className="text-sm text-error">{errors[name]}</p> : null
  const Heading = session ? 'h4' : 'h3'

  return (
    <form ref={form} onSubmit={submit} aria-labelledby={`${id}-heading`} aria-busy={save.isPending} className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-low p-4 sm:p-6">
      <div>
        <Heading id={`${id}-heading`} className="text-lg font-semibold text-on-surface">{session ? `Add a term to ${session.name}` : 'New academic session'}</Heading>
        <p className="mt-1 text-sm text-on-surface-variant">All fields are required.{session ? ' Dates must be within this session.' : ' New sessions are saved as not current; class placement is managed separately.'}</p>
      </div>
      {failure ? <p role="alert" className="text-sm text-error">{failure}</p> : null}
      <fieldset disabled={save.isPending} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className={`min-w-0 space-y-2 ${session ? '' : 'sm:col-span-2'}`}>
          <Label htmlFor={`${id}-name`}>{session ? 'Term name' : 'Session name'}</Label>
          <Input ref={first} id={`${id}-name`} name="name" required maxLength={120} autoComplete="off" {...errorProps('name')} />
          {fieldError('name')}
        </div>
        {session ? <div className="space-y-2">
          <Label htmlFor={`${id}-order`}>Term order</Label>
          <Input id={`${id}-order`} name="orderIndex" type="number" inputMode="numeric" min={1} max={2147483647} step={1} required defaultValue={Math.max(0, ...session.terms.map((term) => term.orderIndex)) + 1} {...errorProps('orderIndex')} />
          {fieldError('orderIndex')}
        </div> : null}
        {(['startDate', 'endDate'] as const).map((name) => <div key={name} className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-${name}`}>{name === 'startDate' ? 'Start date' : 'End date'}</Label>
          <Input id={`${id}-${name}`} name={name} type="date" required min={session?.startDate.slice(0, 10)} max={session?.endDate.slice(0, 10)} {...errorProps(name)} />
          {fieldError(name)}
        </div>)}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit">{save.isPending ? <Spinner size={16} decorative /> : null}{session ? 'Save term' : 'Save session'}</Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </fieldset>
    </form>
  )
}
