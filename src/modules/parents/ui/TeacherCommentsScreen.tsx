'use client'

import { useState } from 'react'
import { classLevelLabel } from '@/lib/client/format'
import { Button, DataState, Input, Label, PageFrame, Picker, option, query, useData, useSmsApi, type Json, type Lookup } from '@/src/modules/workspace/ui/common'
import type { teacherFamilies } from '../service'
import { CommentThread } from './Comments'
import { ParentPagination } from './ParentAccountsScreen'

export function TeacherCommentsScreen() {
  return <PageFrame title="Parent comments" description="Exchange comments with parents of children in your form class.">{() => <TeacherCommentsPanel />}</PageFrame>
}

function TeacherCommentsPanel() {
  const api = useSmsApi(), lookup = useData<Lookup>('lookups')
  const [arm, setArm] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1), [selected, setSelected] = useState('')
  const state = useData<Json<Awaited<ReturnType<typeof teacherFamilies>>>>(`parent-families${query({ classArmId: arm || undefined, search, page, pageSize: 30 })}`)
  const arms = lookup.data?.arms.filter(item => item.formTeacherId === api.user.id) ?? []
  return <div className="space-y-5">
    <section className="card grid gap-4 p-5 md:grid-cols-2">
      <Picker label="Form class (leave blank for all your form classes)" value={arm} onChange={value => { setArm(value); setPage(1); setSelected('') }} options={arms.map(item => option(item.id, `${classLevelLabel(item.level as Parameters<typeof classLevelLabel>[0])} ${item.name}`))} />
      <div className="space-y-2"><Label htmlFor="family-search">Find a child</Label><Input id="family-search" placeholder="Name or admission number" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setSelected('') }} /></div>
    </section>
    <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
      {state.data && <>
        <div className="card divide-y">{state.data.families.map(family => <div key={family.parentStudentId} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><strong>{family.student.fullName}</strong><p className="mt-1 text-sm text-on-surface-variant">{family.student.regNumber} · Parent: {family.parent.fullName}</p></div>
          <Button variant={selected === family.parentStudentId ? 'default' : 'outline'} onClick={() => setSelected(family.parentStudentId)} aria-label={`Comments with ${family.parent.fullName} about ${family.student.fullName}`}>Open comments</Button>
        </div>)}{!state.data.families.length && <p className="p-6">No linked parents found for your form classes. The school administrator can create parent accounts and link children.</p>}</div>
        <ParentPagination meta={state.data.meta} onPage={value => { setPage(value); setSelected('') }} />
      </>}
    </DataState>
    {selected && <CommentThread key={selected} parentStudentId={selected} staff />}
  </div>
}
