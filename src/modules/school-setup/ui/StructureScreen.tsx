'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { api, ApiClientError, errorMessage } from '@/lib/client/api'
import { CLASS_LEVELS } from '@/lib/core/domain'
import { SMS_CONTEXT_HEADER, smsContextKey } from '@/src/modules/shared/context-key'
import { isContextError, structureKey, useSmsWorkspace, type SmsSchool } from '@/src/modules/shared/ui/SmsWorkspace'
import { SchoolSelector } from './SchoolSelector'
import { StructureForm } from './StructureForm'
import type { ClassArmsResponse, ClassArmSummary, SubjectsResponse } from './types'

export function StructureScreen() {
  const { user, school, switching, scopeProblem } = useSmsWorkspace()
  return <div className="space-y-6">
    <header>
      <p className="text-sm font-semibold text-primary">School setup</p>
      <h1 className="mt-1 font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">Classes &amp; subjects</h1>
      <p className="mt-2 max-w-2xl text-on-surface-variant">Set up class arms and your school’s subject list.</p>
    </header>
    {user.role === 'SUPER_ADMIN' ? <SchoolSelector /> : <p className="text-sm text-on-surface-variant">Managing <strong className="text-on-surface">{school?.name}</strong></p>}
    {switching ? <div role="status" className="flex items-center gap-3 py-8"><Spinner size={20} decorative />Switching school…</div>
      : scopeProblem ? <StructureProblem message={scopeProblem} reload />
        : school ? <StructurePanel key={`${user.id}:${school.id}`} school={school} />
          : <div className="card p-6 text-on-surface-variant">Choose a school above to manage its class arms and subjects.</div>}
  </div>
}

function StructureProblem({ message, reload = false, retry }: { message: string; reload?: boolean; retry?: () => void }) {
  return <section role="alert" className="card space-y-3 p-6">
    <h2 className="font-semibold text-on-surface">Could not load school setup</h2>
    <p className="text-sm text-error">{message}</p>
    <Button variant="outline" onClick={reload ? () => window.location.reload() : retry}>{reload ? 'Reload school' : 'Retry school setup'}</Button>
  </section>
}

function StructurePanel({ school }: { school: SmsSchool }) {
  const { user, reportContextError } = useSmsWorkspace()
  const client = useQueryClient()
  const armTrigger = useRef<HTMLButtonElement>(null)
  const subjectTrigger = useRef<HTMLButtonElement>(null)
  const restoreAfterClose = useRef<HTMLButtonElement | null>(null)
  const [editor, setEditor] = useState<'arm' | 'subject' | null>(null)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (editor === null && restoreAfterClose.current) {
      restoreAfterClose.current.focus()
      restoreAfterClose.current = null
    }
  }, [editor])
  const key = structureKey(user.id, school.id)
  const headers = { [SMS_CONTEXT_HEADER]: smsContextKey(user.id, school.id) }
  const structure = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const [arms, subjects] = await Promise.all([
        api.get<ClassArmsResponse>('/api/sms/staff/class-arms', { signal, headers }),
        api.get<SubjectsResponse>('/api/sms/staff/subjects', { signal, headers }),
      ])
      if (arms.schoolId !== school.id || subjects.schoolId !== school.id) {
        throw new ApiClientError(409, { code: 'CONFLICT', message: 'The selected school changed. Reload before continuing.', details: { reason: 'SCHOOL_SCOPE_CHANGED' } })
      }
      return { arms: arms.arms, subjects: subjects.subjects }
    },
  })
  const setDefault = useMutation({
    mutationKey: [...key, 'default-arm'],
    mutationFn: (armId: string) => api.post<{ arm: ClassArmSummary }>(`/api/sms/staff/class-arms/${encodeURIComponent(armId)}/default`, {}, { headers }),
    onMutate: () => { setFailure(null); setNotice('') },
    onSuccess: async ({ arm }) => {
      await client.invalidateQueries({ queryKey: key })
      setNotice(`${arm.level} ${arm.name} is now the default arm.`)
      requestAnimationFrame(() => document.getElementById(`class-level-${arm.level}`)?.focus())
    },
    onError: (error) => { if (!reportContextError(error)) setFailure(errorMessage(error)) },
  })

  function finish(message = '') {
    restoreAfterClose.current = editor === 'arm' ? armTrigger.current : subjectTrigger.current
    setEditor(null)
    setNotice(message)
  }
  if (structure.isPending) return <div role="status" className="flex items-center gap-3 py-8"><Spinner size={20} decorative />Loading class arms and subjects…</div>
  if (structure.isError) return <StructureProblem message={errorMessage(structure.error)} reload={isContextError(structure.error)} retry={() => void structure.refetch()} />
  const busy = editor !== null || setDefault.isPending

  return <div className="space-y-4">
    <p role="status" className="min-h-6 text-sm text-primary">{notice}</p>
    {failure ? <p role="alert" className="text-sm text-error">{failure}</p> : null}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="card min-w-0 space-y-5 p-4 sm:p-6" aria-labelledby="class-arms-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="class-arms-heading" className="text-xl font-semibold text-on-surface">Class arms</h2>
          <Button ref={armTrigger} disabled={busy} onClick={() => { setNotice(''); setEditor('arm') }}><Icon name="add" size={18} />Add class arm</Button>
        </div>
        <p className="text-sm text-on-surface-variant">Default arms determine where future level-only roster entries are placed.</p>
        {editor === 'arm' ? <StructureForm kind="arm" school={school} onDone={finish} onCancel={() => finish()} /> : null}
        {!structure.data.arms.length ? <p className="text-sm text-on-surface-variant">No class arms yet. Add an arm for a class level.</p> : CLASS_LEVELS.map((level) => {
          const arms = structure.data.arms.filter((arm) => arm.level === level)
          if (!arms.length) return null
          return <div key={level} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`class-level-${level}`} tabIndex={-1} className="font-semibold text-on-surface">{level}</h3>
              {!arms.some((arm) => arm.isDefault) ? <span className="text-sm text-on-surface-variant">Default not set</span> : null}
            </div>
            <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {arms.map((arm) => <li key={arm.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-words font-medium text-on-surface">{arm.name}</p>
                  <p className="text-sm text-on-surface-variant">{arm._count.enrollments} enrollment record{arm._count.enrollments === 1 ? '' : 's'}</p>
                </div>
                {arm.isDefault ? <span className="rounded-full bg-primary-container/20 px-3 py-1 text-sm font-semibold text-primary">Default</span>
                  : <Button variant="outline" disabled={busy} onClick={() => setDefault.mutate(arm.id)}>{setDefault.isPending && setDefault.variables === arm.id ? <Spinner size={16} decorative /> : null}Set as default<span className="sr-only"> for {level} {arm.name}</span></Button>}
              </li>)}
            </ul>
          </div>
        })}
      </section>
      <section className="card min-w-0 space-y-5 p-4 sm:p-6" aria-labelledby="subjects-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="subjects-heading" className="text-xl font-semibold text-on-surface">Subjects <span className="text-base font-normal text-on-surface-variant">({structure.data.subjects.length})</span></h2>
          <Button ref={subjectTrigger} disabled={busy} onClick={() => { setNotice(''); setEditor('subject') }}><Icon name="add" size={18} />Add subject</Button>
        </div>
        <p className="text-sm text-on-surface-variant">Subjects linked from CBT exams appear here too.</p>
        {editor === 'subject' ? <StructureForm kind="subject" school={school} onDone={finish} onCancel={() => finish()} /> : null}
        {!structure.data.subjects.length ? <p className="text-sm text-on-surface-variant">No subjects yet. Add the subjects your school teaches.</p>
          : <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {structure.data.subjects.map((subject) => <li key={subject.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0 break-words font-medium text-on-surface">{subject.name}</span>
              <span className="text-sm text-on-surface-variant">{subject._count.exams} CBT exam{subject._count.exams === 1 ? '' : 's'}</span>
            </li>)}
          </ul>}
      </section>
    </div>
  </div>
}
