'use client'

import Link from 'next/link'
import { useState } from 'react'
import { classLevelLabel } from '@/lib/client/format'
import { DataState, PageFrame, Picker, option, query, useData, useSmsApi, type Json } from '@/src/modules/workspace/ui/common'
import type { parentChildren } from '../service'
import type { ReportSnapshot } from '@/src/modules/results/service'
import { CommentThread } from './Comments'

type Child = Json<Awaited<ReturnType<typeof parentChildren>>>[number]
type Report = { id: string; total: string; average: string; position: number; teacherRemark: string | null; principalRemark: string | null; snapshot: ReportSnapshot }

export function ParentResultsScreen() {
  return <PageFrame title="Child results" description="View your child’s published term results and download report cards.">{() => <ChildrenPanel />}</PageFrame>
}

export function ParentCommentsScreen({ initialChildId }: { initialChildId?: string }) {
  return <PageFrame title="Teacher comments" description="Exchange comments about your child with their form teacher.">{() => <ChildrenPanel comments initialChildId={initialChildId} />}</PageFrame>
}

function ChildrenPanel({ comments = false, initialChildId = '' }: { comments?: boolean; initialChildId?: string }) {
  const state = useData<{ children: Child[] }>('children')
  const [selected, setSelected] = useState(initialChildId)
  const child = state.data?.children.find(item => item.student.id === selected) ?? state.data?.children[0]
  return <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
    {child ? <div className="space-y-5">
      <section className="card grid gap-4 p-5 md:grid-cols-2">
        <h2 className="break-words text-xl font-semibold md:col-span-2">{child.student.fullName}</h2>
        <Picker label="Child" value={child.student.id} onChange={setSelected} options={state.data!.children.map(item => option(item.student.id, item.student.fullName))} />
        <div className="space-y-1 text-sm md:self-end">
          <p>{child.classArm ? `${classLevelLabel(child.classArm.level)} ${child.classArm.name}` : classLevelLabel(child.student.classLevel)}</p>
          <p className="text-on-surface-variant">Form teacher: {child.formTeacher?.fullName ?? 'Not yet assigned'}</p>
        </div>
      </section>
      {comments ? <CommentThread key={child.parentStudentId} parentStudentId={child.parentStudentId} /> : <ChildResults key={child.student.id} child={child} />}
    </div> : <p className="card p-6">No children are linked to your account yet. Ask the school administrator to link your child.</p>}
  </DataState>
}

function ChildResults({ child }: { child: Child }) {
  const api = useSmsApi()
  const state = useData<{ reports: Report[] }>(`reports${query({ studentId: child.student.id })}`)
  return <div className="space-y-5">
    <Link className="btn-secondary" href={`/sms/parent/comments${query({ child: child.student.id })}`}>Comment to form teacher</Link>
    <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
      {state.data?.reports.length ? <div className="space-y-5">{state.data.reports.map(report => <article key={report.id} className="card space-y-4 p-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><h3 className="break-words text-xl font-semibold">{child.student.fullName} · {report.snapshot.term}</h3><p className="mt-1 text-sm text-on-surface-variant">{report.snapshot.session} · {report.snapshot.className}</p></div>
          <a className="btn-secondary" aria-label={`Download report card for ${child.student.fullName}, ${report.snapshot.term}`} href={`${api.base}report-pdf${query({ id: report.id })}`}>Download report card</a>
        </header>
        <dl className="grid grid-cols-3 gap-3 rounded-lg bg-surface-container-low p-4">
          <div><dt className="text-sm">Average</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{report.average}%</dd></div>
          <div><dt className="text-sm">Total</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{report.total}</dd></div>
          <div><dt className="text-sm">Position</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{report.position}</dd></div>
        </dl>
        <div className="overflow-x-auto focus-visible:[outline:revert]" tabIndex={0} role="region" aria-label={`Subject results for ${child.student.fullName}, ${report.snapshot.session}, ${report.snapshot.term}`}><table className="w-full min-w-[500px] text-left">
          <caption className="sr-only">Subject results for {child.student.fullName}, {report.snapshot.term}</caption>
          <thead><tr className="border-b"><th scope="col" className="p-3">Subject</th><th scope="col" className="p-3">Score</th><th scope="col" className="p-3">Grade</th><th scope="col" className="p-3">Remark</th></tr></thead>
          <tbody>{report.snapshot.subjects.map(subject => <tr key={subject.id} className="border-b"><th scope="row" className="p-3 font-medium">{subject.name}</th><td className="p-3 tabular-nums">{subject.total}</td><td className="p-3">{subject.grade}</td><td className="p-3">{subject.remark}</td></tr>)}</tbody>
        </table></div>
        {report.teacherRemark && <p className="whitespace-pre-wrap break-words"><strong>Teacher’s remark:</strong> {report.teacherRemark}</p>}
        {report.principalRemark && <p className="whitespace-pre-wrap break-words"><strong>Principal’s remark:</strong> {report.principalRemark}</p>}
      </article>)}</div> : <p className="card p-6">No published results for {child.student.fullName} yet. Results appear here after the school publishes them.</p>}
    </DataState>
  </div>
}
