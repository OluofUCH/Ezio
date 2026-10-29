'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/Spinner'
import { api, ApiClientError, errorMessage } from '@/lib/client/api'
import { CLASS_LEVELS } from '@/lib/core/domain'
import { SMS_CONTEXT_HEADER, smsContextKey } from '@/src/modules/shared/context-key'
import { structureKey, useSmsWorkspace, type SmsSchool } from '@/src/modules/shared/ui/SmsWorkspace'
import { createClassArmSchema, createSubjectSchema, type CreateClassArmInput, type CreateSubjectInput } from '../structure-validation'

type Props = { kind: 'arm' | 'subject'; school: SmsSchool; onDone: (message: string) => void; onCancel: () => void }

export function StructureForm({ kind, school, onDone, onCancel }: Props) {
  const { user, reportContextError } = useSmsWorkspace()
  const client = useQueryClient()
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const levelInput = useRef<HTMLSelectElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => { if (kind === 'arm') levelInput.current?.focus(); else nameInput.current?.focus() }, [kind])

  function focusError(fields: Record<string, string>) {
    requestAnimationFrame(() => {
      const name = Object.keys(fields)[0]
      const element = name ? form.current?.elements.namedItem(name) : null
      if (element instanceof HTMLElement) element.focus()
    })
  }

  const save = useMutation({
    mutationKey: [...structureKey(user.id, school.id), 'create', kind],
    mutationFn: (input: CreateClassArmInput | CreateSubjectInput) => api.post(
      `/api/sms/staff/${kind === 'arm' ? 'class-arms' : 'subjects'}`, input,
      { headers: { [SMS_CONTEXT_HEADER]: smsContextKey(user.id, school.id) } },
    ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: structureKey(user.id, school.id) })
      onDone(kind === 'arm' ? 'Class arm added.' : 'Subject added.')
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
    const input = { name: fields.get('name') }
    const parsed = kind === 'arm'
      ? createClassArmSchema.safeParse({ ...input, level: fields.get('level') })
      : createSubjectSchema.safeParse(input)
    if (!parsed.success) {
      const messages = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
      setErrors(messages)
      focusError(messages)
      return
    }
    save.mutate(parsed.data)
  }
  const invalid = (name: string) => ({ 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `${id}-${name}-error` : undefined })
  const error = (name: string) => errors[name] ? <p id={`${id}-${name}-error`} className="text-sm text-error">{errors[name]}</p> : null

  return <form ref={form} onSubmit={submit} aria-labelledby={`${id}-heading`} aria-busy={save.isPending} className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
    <h3 id={`${id}-heading`} className="font-semibold text-on-surface">{kind === 'arm' ? 'New class arm' : 'New subject'}</h3>
    <p className="text-sm text-on-surface-variant">{kind === 'arm' ? 'Choose a level and name its arm, for example JSS1 and A.' : 'Enter the subject name used by your school.'} All fields are required.</p>
    {failure ? <p role="alert" className="text-sm text-error">{failure}</p> : null}
    <fieldset disabled={save.isPending} className="min-w-0 space-y-4">
      {kind === 'arm' ? <div className="space-y-2">
        <Label htmlFor={`${id}-level`}>Class level</Label>
        <select ref={levelInput} id={`${id}-level`} name="level" required defaultValue="" {...invalid('level')}
          className="min-h-11 w-full min-w-0 rounded-lg border border-outline bg-surface px-3 py-2 text-base text-on-surface focus-visible:[outline:revert] disabled:opacity-50">
          <option value="">Choose a class level</option>
          {CLASS_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        {error('level')}
      </div> : null}
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>{kind === 'arm' ? 'Arm name' : 'Subject name'}</Label>
        <Input ref={nameInput} id={`${id}-name`} name="name" required maxLength={120} autoComplete="off" {...invalid('name')} />
        {error('name')}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{save.isPending ? <Spinner size={16} decorative /> : null}{kind === 'arm' ? 'Save class arm' : 'Save subject'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </fieldset>
  </form>
}
