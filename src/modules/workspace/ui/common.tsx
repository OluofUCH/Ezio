'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/Spinner'
import { api, ApiClientError, errorMessage, query } from '@/lib/client/api'
import { SMS_CONTEXT_HEADER, smsContextKey } from '@/src/modules/shared/context-key'
import { useSmsWorkspace, schoolDataPrefix, type SmsSchool } from '@/src/modules/shared/ui/SmsWorkspace'
import { SchoolSelector } from '@/src/modules/school-setup/ui/SchoolSelector'
import type { Prisma } from '@prisma/client'

export type Json<T> = T extends Date ? string : T extends Prisma.Decimal ? string : T extends Uint8Array ? never : T extends Array<infer U> ? Json<U>[] : T extends object ? { [K in keyof T]: Json<T[K]> } : T
export type Lookup = { sessions: { id: string; name: string; isCurrent: boolean; startDate: string; endDate: string; terms: { id: string; name: string; startDate: string; endDate: string; academicSessionId: string }[] }[]; arms: { id: string; level: string; name: string; formTeacherId: string | null }[]; subjects: { id: string; name: string }[]; teachers: { id: string; fullName: string; isActive: boolean }[]; components: { id: string; name: string; maxScore: string }[]; assignments: { classArmId: string; subjectId: string; academicSessionId: string }[] }
export const option = (id: string, label: string) => ({ value: id, label })
export function termsOf(lookup?: Lookup) { return lookup?.sessions.flatMap((s) => s.terms.map((t) => ({ ...t, label: `${s.name} · ${t.name}` }))) ?? [] }
export function useSmsApi() {
  const workspace = useSmsWorkspace()
  const schoolId = workspace.school?.id ?? ''
  const headers = { [SMS_CONTEXT_HEADER]: smsContextKey(workspace.user.id, schoolId) }
  const base = `/api/sms/${workspace.user.role === 'STUDENT' ? 'student' : 'staff'}/workspace/`
  return { ...workspace, base, headers, key: [...schoolDataPrefix(workspace.user.id), schoolId], get: <T,>(path: string, signal?: AbortSignal) => api.get<T>(path.startsWith('/') ? path : base + path, { signal, headers }), post: <T,>(path: string, body: unknown) => api.post<T>(path.startsWith('/') ? path : base + path, body, { headers }), patch: <T,>(path: string, body: unknown) => api.patch<T>(path, body, { headers }), put: <T,>(path: string, body: unknown) => api.put<T>(path, body, { headers }) }
}
export function useData<T>(path: string | null) {
  const api = useSmsApi()
  return useQuery({ queryKey: [...api.key, path], queryFn: ({ signal }) => api.get<T>(path!, signal), enabled: Boolean(path && api.school && !api.switching) })
}
export function PageFrame({ title, description, children }: { title: string; description?: string; children: (school: SmsSchool) => ReactNode }) {
  const { user, school, switching, scopeProblem } = useSmsWorkspace()
  return <div className="space-y-6"><header><p className="text-sm font-semibold text-primary">School management</p><h1 className="mt-1 text-headline-lg-mobile font-semibold md:text-headline-lg">{title}</h1>{description && <p className="mt-2 max-w-3xl text-on-surface-variant">{description}</p>}</header>
    {user.role === 'SUPER_ADMIN' ? <SchoolSelector /> : <p className="text-sm">{school?.name}</p>}
    {switching ? <Loading /> : scopeProblem ? <Problem message={scopeProblem} reload /> : school ? <div key={`${user.id}:${school.id}`}>{children(school)}</div> : <p className="card p-6">Choose a school to continue.</p>}
  </div>
}
export function Loading() { return <p role="status" className="flex items-center gap-3 p-6"><Spinner decorative />Loading…</p> }
export function Problem({ message, retry, reload }: { message: string; retry?: () => void; reload?: boolean }) { return <div role="alert" className="card space-y-3 p-5"><p className="text-error">{message}</p><Button variant="outline" onClick={reload ? () => window.location.reload() : retry}>{reload ? 'Reload' : 'Retry'}</Button></div> }
export function DataState({ loading, error, retry, children }: { loading: boolean; error: unknown; retry: () => void; children: ReactNode }) { return loading ? <Loading /> : error ? <Problem message={errorMessage(error)} retry={retry} /> : <>{children}</> }
export type Field = { name: string; label: string; type?: 'text' | 'email' | 'password' | 'tel' | 'date' | 'number' | 'select' | 'textarea' | 'checkbox'; options?: { value: string; label: string }[]; required?: boolean; value?: string | number | boolean | null; min?: number; max?: number; clearable?: boolean }

export function EditForm({ title, fields, save, done, cancel, submitLabel = 'Save' }: { title: string; fields: Field[]; save: (value: Record<string, unknown>) => Promise<unknown>; done: () => void; cancel?: () => void; submitLabel?: string }) {
  const id = useId(), ref = useRef<HTMLFormElement>(null)
  const [failure, setFailure] = useState(''), [errors, setErrors] = useState<Record<string, string>>({})
  const api = useSmsApi(), client = useQueryClient()
  useEffect(() => { ref.current?.querySelector<HTMLElement>('input,select,textarea')?.focus() }, [])
  const mutation = useMutation({ mutationKey: [...api.key, 'write', title], mutationFn: save,
    onSuccess: async () => { await client.invalidateQueries({ queryKey: api.key }); done() },
    onError: (error) => { if (api.reportContextError(error)) return; setFailure(errorMessage(error)); const fields = error instanceof ApiClientError ? error.fieldErrors() : {}; setErrors(fields); requestAnimationFrame(() => { const element = ref.current?.elements.namedItem(Object.keys(fields)[0] ?? ''); if (element instanceof HTMLElement) element.focus() }) },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFailure(''); setErrors({})
    const form = new FormData(event.currentTarget), values: Record<string, unknown> = {}
    for (const field of fields) { const value = form.get(field.name); if (field.type === 'checkbox') values[field.name] = Boolean(value); else if (value !== '' || field.required || field.clearable) values[field.name] = field.type === 'number' ? Number(value) : value }
    mutation.mutate(values)
  }
  return <form ref={ref} onSubmit={submit} aria-labelledby={`${id}-title`} aria-busy={mutation.isPending} className="rounded-xl border border-outline-variant bg-surface-container-low p-5 space-y-4">
    <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>{failure && <p role="alert" className="text-error text-sm">{failure}</p>}
    <fieldset disabled={mutation.isPending} className="grid min-w-0 gap-4 sm:grid-cols-2">{fields.map((field) => {
      const props = { id: `${id}-${field.name}`, name: field.name, required: field.required, 'aria-invalid': Boolean(errors[field.name]), 'aria-describedby': errors[field.name] ? `${id}-${field.name}-error` : undefined }
      return <div key={field.name} className={`min-w-0 space-y-2 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}><Label htmlFor={props.id}>{field.label}{field.required ? ' *' : ''}</Label>
        {field.type === 'select' ? <select {...props} defaultValue={String(field.value ?? '')} className="min-h-11 w-full min-w-0 rounded-lg border border-outline bg-surface p-2"><option value="">Choose…</option>{field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          : field.type === 'textarea' ? <textarea {...props} defaultValue={String(field.value ?? '')} rows={3} className="w-full rounded-lg border border-outline bg-surface p-3" />
            : field.type === 'checkbox' ? <input {...props} type="checkbox" defaultChecked={Boolean(field.value)} className="block h-6 w-6 accent-primary" />
              : <Input {...props} type={field.type ?? 'text'} min={field.min} max={field.max} step={field.type === 'number' ? '0.01' : undefined} defaultValue={String(field.value ?? '')} autoComplete={field.type === 'password' ? 'new-password' : 'off'} />}
        {errors[field.name] && <p id={`${id}-${field.name}-error`} className="text-sm text-error">{errors[field.name]}</p>}</div>
    })}<div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit">{mutation.isPending && <Spinner decorative size={16} />}{submitLabel}</Button>{cancel && <Button variant="outline" onClick={cancel}>Cancel</Button>}</div></fieldset>
  </form>
}

export function Action({ label, run, after, danger = false }: { label: string; run: () => Promise<unknown>; after?: () => void; danger?: boolean }) {
  const api = useSmsApi(), client = useQueryClient()
  const [error, setError] = useState('')
  const mutation = useMutation({ mutationKey: [...api.key, 'write', label], mutationFn: run, onSuccess: async () => { await client.invalidateQueries({ queryKey: api.key }); setError(''); after?.() }, onError: (e) => { if (!api.reportContextError(e)) setError(errorMessage(e)) } })
  return <span className="inline-flex flex-col gap-1"><Button variant={danger ? 'outline' : 'default'} disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending && <Spinner decorative size={16} />}{label}</Button>{error && <span role="alert" className="text-sm text-error">{error}</span>}</span>
}
export function Picker({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  const id = useId()
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full min-w-0 rounded-lg border border-outline bg-surface p-2"><option value="">Choose…</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
}
export { Button, Input, Label, query }
