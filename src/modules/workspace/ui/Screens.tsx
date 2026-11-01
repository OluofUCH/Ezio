'use client'

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, query } from '@/lib/client/api'
import { Icon } from '@/components/ui/Icon'
import { StudentImport } from '@/components/staff/StudentImport'
import { studentProfileFields } from '@/src/modules/students/ui/profile-fields'
import { DEFAULT_PARENT_PIN, guardianAccountMessage, type GuardianAccountResult } from '@/src/modules/parents/rules'
import { Action, Button, DataState, EditForm, Input, Label, PageFrame, Picker, option, termsOf, useData, useSmsApi, type Lookup } from './common'

const armLabel = (arm: { level: string; name: string }) => `${arm.level} ${arm.name}`
function LookupState({ children }: { children: (lookup: Lookup) => React.ReactNode }) {
  const state = useData<Lookup>('lookups')
  return <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>{state.data ? children(state.data) : null}</DataState>
}

type Teacher = { id: string; fullName: string; email: string; isActive: boolean; teacherProfile: { phone: string | null; qualifications: string | null } | null; formTeacherArms: { id: string; level: string; name: string }[] }
type Assignment = { id: string; isActive: boolean; teacher: Teacher; subject: { id: string; name: string }; classArm: { id: string; level: string; name: string }; academicSession: { id: string; name: string } }
export function StaffScreen() {
  return <PageFrame title="Staff & assignments" description="Manage teacher accounts, profile details, teaching assignments and form-teacher designations.">{() => <LookupState>{(lookup) => <StaffPanel lookup={lookup} />}</LookupState>}</PageFrame>
}
function StaffPanel({ lookup }: { lookup: Lookup }) {
  const apiClient = useSmsApi(), [editor, setEditor] = useState<string | null>(null), [selected, setSelected] = useState('')
  const teachers = useData<{ teachers: Teacher[]; meta: { total: number } }>('/api/sms/staff/teachers?pageSize=200')
  const assignments = useData<{ assignments: Assignment[] }>('/api/sms/staff/teaching-assignments?pageSize=200')
  const teacher = teachers.data?.teachers.find((item) => item.id === selected)
  return <DataState loading={teachers.isPending || assignments.isPending} error={teachers.error || assignments.error} retry={() => { void teachers.refetch(); void assignments.refetch() }}>
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">Teachers ({teachers.data?.meta.total ?? 0})</h2><Button onClick={() => setEditor('new')}><Icon name="person_add" size={18} />Add teacher</Button></div>
      {editor === 'new' && <EditForm title="New teacher account" submitLabel="Create teacher" cancel={() => setEditor(null)} done={() => setEditor(null)} save={(data) => apiClient.post('/api/sms/staff/teachers', data)} fields={[
        { name: 'fullName', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'password', label: 'Temporary password', type: 'password', required: true },
      ]} />}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.7fr)]">
        <section className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b bg-surface-container-low"><th className="p-3">Teacher</th><th className="p-3">Status</th><th className="p-3">Form class</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y">{teachers.data?.teachers.map((item) => <tr key={item.id}><td className="p-3"><strong>{item.fullName}</strong><br/><span className="text-sm text-on-surface-variant">{item.email}</span></td><td className="p-3">{item.isActive ? 'Active' : 'Inactive'}</td><td className="p-3">{item.formTeacherArms.map(armLabel).join(', ') || '—'}</td><td className="p-3"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setSelected(item.id); setEditor('profile') }}>Profile</Button><Action label={item.isActive ? 'Deactivate' : 'Activate'} danger={item.isActive} run={() => apiClient.patch(`/api/sms/staff/teachers/${item.id}/account`, { isActive: !item.isActive })} /></div></td></tr>)}</tbody></table></div></section>
        <aside className="space-y-4">{teacher && editor === 'profile' && <EditForm title={`Profile · ${teacher.fullName}`} cancel={() => setEditor(null)} done={() => setEditor(null)} save={(data) => apiClient.patch(`/api/sms/staff/teachers/${teacher.id}/profile`, data)} fields={[
          { name: 'phone', label: 'Phone', type: 'tel', value: teacher.teacherProfile?.phone, clearable: true }, { name: 'qualifications', label: 'Qualifications', type: 'textarea', value: teacher.teacherProfile?.qualifications, clearable: true },
        ]} />}</aside>
      </div>
      <section className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">Teaching assignments</h2><Button onClick={() => setEditor('assignment')}>Add assignment</Button></div>
        {editor === 'assignment' && <EditForm title="New teaching assignment" cancel={() => setEditor(null)} done={() => setEditor(null)} save={(data) => apiClient.post('/api/sms/staff/teaching-assignments', data)} fields={[
          { name: 'teacherId', label: 'Teacher', type: 'select', required: true, options: lookup.teachers.filter((t) => t.isActive).map((t) => option(t.id, t.fullName)) },
          { name: 'subjectId', label: 'Subject', type: 'select', required: true, options: lookup.subjects.map((s) => option(s.id, s.name)) },
          { name: 'classArmId', label: 'Class arm', type: 'select', required: true, options: lookup.arms.map((a) => option(a.id, armLabel(a))) },
          { name: 'academicSessionId', label: 'Academic session', type: 'select', required: true, options: lookup.sessions.map((s) => option(s.id, s.name)) },
        ]} />}
        <div className="card overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr className="border-b bg-surface-container-low"><th className="p-3">Teacher</th><th>Subject</th><th>Class</th><th>Session</th><th>Status</th></tr></thead><tbody className="divide-y">{assignments.data?.assignments.map((a) => <tr key={a.id}><td className="p-3">{a.teacher.fullName}</td><td>{a.subject.name}</td><td>{armLabel(a.classArm)}</td><td>{a.academicSession.name}</td><td><Action label={a.isActive ? 'Deactivate' : 'Reactivate'} danger={a.isActive} run={() => apiClient.patch(`/api/sms/staff/teaching-assignments/${a.id}`, { isActive: !a.isActive })}/></td></tr>)}</tbody></table></div>
      </section>
      <section className="card space-y-4 p-5"><h2 className="text-xl font-semibold">Form teachers</h2><p className="text-sm text-on-surface-variant">Form teachers mark attendance for the selected arm.</p><div className="grid gap-3 md:grid-cols-2">{lookup.arms.map((arm) => <FormTeacher key={arm.id} arm={arm} teachers={lookup.teachers.filter((t) => t.isActive)} />)}</div></section>
    </div>
  </DataState>
}
function FormTeacher({ arm, teachers }: { arm: Lookup['arms'][number]; teachers: Lookup['teachers'] }) {
  const apiClient = useSmsApi(), client = useQueryClient(), [value, setValue] = useState(arm.formTeacherId ?? '')
  return <div className="rounded-lg border p-3 space-y-2"><Picker label={armLabel(arm)} value={value} onChange={setValue} options={teachers.map((t) => option(t.id, t.fullName))}/><Action label="Save form teacher" run={() => apiClient.put(`/api/sms/staff/class-arms/${arm.id}/form-teacher`, { teacherId: value || null })} after={() => void client.invalidateQueries({ queryKey: apiClient.key })}/></div>
}

type ManagedStudent = { id: string; regNumber: string; fullName: string; classLevel: string; pin?: string; profile?: Record<string, string | null> | null; photo?: { updatedAt: string } | null; enrollments: { id: string; status: string; reason: string; isCurrent: boolean; academicSession: { id: string; name: string }; classArm: { id: string; level: string; name: string } }[] }
export function StudentsScreen() {
  const { user } = useSmsApi()
  const admin = user.role === 'SCHOOL_ADMIN'
  return <PageFrame title={admin ? 'Students & enrollment' : 'My students'} description={admin ? 'Admit students, record guardian details and manage school placements.' : 'Admit students into your assigned form classes and create guardian access in the same step.'}>{() => <LookupState>{(lookup) => <StudentsPanel lookup={lookup}/>}</LookupState>}</PageFrame>
}
function StudentsPanel({ lookup }: { lookup: Lookup }) {
  const apiClient = useSmsApi(), [editor, setEditor] = useState<string | null>(null), [selected, setSelected] = useState(''), [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const admin = apiClient.user.role === 'SCHOOL_ADMIN'
  const arms = admin ? lookup.arms : lookup.arms.filter(arm => arm.formTeacherId === apiClient.user.id)
  const state = useData<{ students: ManagedStudent[]; meta: { total: number } }>(`students${query({ pageSize: 200, search })}`)
  const student = state.data?.students.find((item) => item.id === selected)
  return <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}><div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex w-full min-w-0 max-w-md gap-2"><Input aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or admission number"/><Button onClick={() => void state.refetch()}>Search</Button></div><div className="flex flex-wrap gap-2"><Button onClick={() => setEditor('new')}>Admit student</Button><Button variant="outline" onClick={() => setEditor('import')}>Import roster</Button><a className="btn-secondary" href="/api/templates/students.csv">Download sample roster</a></div></div>
    <p role="status" className="text-sm">{message}</p>
    {(editor === 'new' || editor === 'profile') && <p className="card p-4 text-sm">Add the guardian’s name and phone number to create parent access automatically. Siblings with the same guardian phone share one account. A new parent account starts with PIN <strong>{DEFAULT_PARENT_PIN}</strong>; existing PINs stay unchanged.</p>}
    {editor === 'new' && <EditForm title="Admit student" cancel={() => setEditor(null)} done={() => setEditor(null)} save={async data => {
      const result = await apiClient.post<{ student: { fullName: string; pin: string; parentAccount: GuardianAccountResult } }>('students', data)
      setMessage(`${result.student.fullName} admitted. Student PIN: ${result.student.pin}. ${guardianAccountMessage(result.student.parentAccount)}`)
      return result
    }} fields={[
      { name: 'regNumber', label: 'Admission / registration number', required: true },
      { name: 'fullName', label: 'Full name', required: true },
      { name: 'classArmId', label: 'Class arm', type: 'select', required: true, options: arms.map(a => option(a.id, armLabel(a))) },
      { name: 'pin', label: 'PIN (leave blank to generate)' },
      ...studentProfileFields(),
    ]} />}
    {editor === 'import' && <RosterUpload close={() => setEditor(null)} />}
    {admin && student && editor === 'profile' && <EditForm title={`Profile · ${student.fullName}`} cancel={() => setEditor(null)} done={() => setEditor(null)} save={async data => {
      const result = await apiClient.post<{ parentAccount: GuardianAccountResult }>('students', { op: 'update', studentId: student.id, ...data })
      setMessage(`${student.fullName} updated. ${guardianAccountMessage(result.parentAccount)}`)
      return result
    }} fields={[
      { name: 'fullName', label: 'Full name', value: student.fullName },
      { name: 'pin', label: 'New PIN' },
      ...studentProfileFields(student.profile, true),
    ]} />}
    {admin && student && editor === 'transition' && <TransitionForm student={student} lookup={lookup} close={() => setEditor(null)} />}
    <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-left"><thead><tr className="border-b bg-surface-container-low"><th className="p-3">Student</th><th>Admission no.</th><th>Current placement</th><th>Status</th>{admin && <th>Actions</th>}</tr></thead><tbody className="divide-y">{state.data?.students.map((item) => { const current=item.enrollments.find(e=>e.isCurrent); return <tr key={item.id}><td className="p-3"><strong>{item.fullName}</strong></td><td>{item.regNumber}</td><td>{current?`${current.academicSession.name} · ${armLabel(current.classArm)}`:'—'}</td><td>{current?.status ?? 'Unplaced'}</td>{admin && <td><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>{setSelected(item.id);setEditor('profile')}}>Profile</Button><Button variant="outline" onClick={()=>{setSelected(item.id);setEditor('transition')}}>Placement</Button><PhotoUpload studentId={item.id}/></div></td>}</tr>})}</tbody></table></div>
    {admin && <section className="card space-y-3 p-5"><h2 className="text-xl font-semibold">Activate academic session</h2><p className="text-sm">Activation moves staged placements into the current session. Stage every active student first when rolling over.</p>{lookup.sessions.filter(s=>!s.isCurrent).map(s=><Action key={s.id} label={`Activate ${s.name}`} run={()=>apiClient.post('enrollments',{op:'activate',academicSessionId:s.id})}/>)}</section>}
  </div></DataState>
}
function RosterUpload({ close }: { close:()=>void }) {
  const apiClient = useSmsApi(), client = useQueryClient()
  return <section className="card space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Import students</h2><Button variant="outline" onClick={close}>Close import</Button></div>
    <StudentImport endpoint={`${apiClient.base}students-import`} headers={apiClient.headers} isFormTeacher={apiClient.user.role === 'TEACHER'} onImported={() => { void client.invalidateQueries({ queryKey: apiClient.key }) }} />
  </section>
}
function PhotoUpload({studentId}:{studentId:string}){const apiClient=useSmsApi(),[busy,setBusy]=useState(false);return <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm font-semibold">{busy?'Uploading…':'Photo'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);try{const form=new FormData();form.set('file',file);await api.post(`${apiClient.base}photo?studentId=${encodeURIComponent(studentId)}`,form,{headers:apiClient.headers})}finally{setBusy(false)}}}/></label>}
function TransitionForm({ student, lookup, close }: { student: ManagedStudent; lookup: Lookup; close: () => void }) {
  const apiClient = useSmsApi()
  return <EditForm title={`Enrollment · ${student.fullName}`} cancel={close} done={close} save={data => apiClient.post('enrollments', {
    studentId: student.id, ...data,
    transferOut: data.reason === 'TRANSFER' && data.classArmId === 'OUT',
    classArmId: data.classArmId === 'OUT' ? undefined : data.classArmId,
  })} fields={[
    { name: 'academicSessionId', label: 'Academic session', type: 'select', required: true, options: lookup.sessions.map(s => option(s.id, s.name)) },
    { name: 'reason', label: 'Action', type: 'select', required: true, options: ['PROMOTION', 'REPEAT', 'TRANSFER', 'WITHDRAWAL'].map(v => option(v, v.toLowerCase())) },
    { name: 'classArmId', label: 'Target arm (OUT = transfer out)', type: 'select', options: [...lookup.arms.map(a => option(a.id, armLabel(a))), option('OUT', 'Transfer out of school')] },
    { name: 'effectiveDate', label: 'Effective date', type: 'date', required: true, value: new Date().toISOString().slice(0, 10) },
  ]} />
}

type Roll = { term:{id:string;name:string}; date:string; roster:{enrollmentId:string;student:{regNumber:string;fullName:string};status:'PRESENT'|'ABSENT'|'LATE'|null}[] }
export function AttendanceScreen(){return <PageFrame title="Attendance" description="Form teachers mark the daily roll call for their own arms. Administrators can review or correct any arm.">{()=> <LookupState>{lookup=><AttendancePanel lookup={lookup}/>}</LookupState>}</PageFrame>}
function AttendancePanel({lookup}:{lookup:Lookup}){const apiClient=useSmsApi(),client=useQueryClient(),[arm,setArm]=useState(''),[term,setTerm]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10));const path=arm&&term&&date?`attendance${query({classArmId:arm,termId:term,date})}`:null;const state=useData<Roll>(path);const [marks,setMarks]=useState<Record<string,string>>({});const rows=useMemo(()=>state.data?.roster??[],[state.data?.roster]);const values=useMemo(()=>Object.fromEntries(rows.map(row=>[row.enrollmentId,marks[row.enrollmentId]??row.status??'PRESENT'])),[rows,marks]);return <div className="space-y-5"><div className="card grid gap-4 p-5 md:grid-cols-3"><Picker label="Class arm" value={arm} onChange={setArm} options={lookup.arms.map(a=>option(a.id,armLabel(a)))}/><Picker label="Term" value={term} onChange={setTerm} options={termsOf(lookup).map(t=>option(t.id,t.label))}/><div><Label htmlFor="attendance-date">Date</Label><Input id="attendance-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div></div><DataState loading={state.isPending} error={state.error} retry={()=>void state.refetch()}>{path&&state.data?<section className="card space-y-4 p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-xl font-semibold">Daily roll ({rows.length})</h2><Action label="Save attendance" run={()=>apiClient.post('attendance',{classArmId:arm,termId:term,date,entries:Object.entries(values).map(([enrollmentId,status])=>({enrollmentId,status}))})} after={()=>{setMarks({});void client.invalidateQueries({queryKey:apiClient.key})}}/></div>{rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left"><thead><tr><th>Student</th><th>Admission no.</th><th>Status</th></tr></thead><tbody>{rows.map(row=><tr key={row.enrollmentId} className="border-t"><td className="py-3">{row.student.fullName}</td><td>{row.student.regNumber}</td><td><select aria-label={`Attendance for ${row.student.fullName}`} value={values[row.enrollmentId]} onChange={e=>setMarks(old=>({...old,[row.enrollmentId]:e.target.value}))} className="min-h-11 rounded border p-2">{['PRESENT','ABSENT','LATE'].map(v=><option key={v}>{v}</option>)}</select></td></tr>)}</tbody></table></div>:<p>No students were enrolled in this arm on this date.</p>}</section>:<p className="card p-5">Choose an arm, term and date.</p>}</DataState></div>}

type Sheet={submission:{id:string;status:string}|null;editable:boolean;term:{id:string;name:string};arm:{id:string;level:string;name:string};subject:{id:string;name:string};components:{id:string;name:string;maxScore:number}[];roster:{id:string;student:{fullName:string;regNumber:string}}[];scores:{id:string;enrollmentId:string;componentId:string;value:string;source:string}[]}
export function ScoresScreen(){return <PageFrame title="Score entry" description="Teachers enter marks only for assigned subjects and class arms. Submit when every component is complete.">{()=> <LookupState>{lookup=><ScorePanel lookup={lookup}/>}</LookupState>}</PageFrame>}
function ScorePanel({lookup}:{lookup:Lookup}){const apiClient=useSmsApi(),client=useQueryClient(),[arm,setArm]=useState(''),[subject,setSubject]=useState(''),[term,setTerm]=useState(''),[draft,setDraft]=useState<Record<string,string>>({}),[reason,setReason]=useState('');const path=arm&&subject&&term?`scores${query({classArmId:arm,subjectId:subject,termId:term})}`:null;const state=useData<Sheet>(path);const sheet=state.data;const value=(e:string,c:string)=>draft[`${e}:${c}`]??sheet?.scores.find(s=>s.enrollmentId===e&&s.componentId===c)?.value??'';async function save(){if(!sheet)return;const entries=[];for(const enrollment of sheet.roster)for(const component of sheet.components){const raw=value(enrollment.id,component.id);if(raw!=='')entries.push({enrollmentId:enrollment.id,componentId:component.id,value:Number(raw)})}await apiClient.post('scores',{classArmId:arm,subjectId:subject,termId:term,entries,reason});setDraft({});await client.invalidateQueries({queryKey:apiClient.key})}return <div className="space-y-5"><div className="card grid gap-4 p-5 md:grid-cols-3"><Picker label="Class arm" value={arm} onChange={setArm} options={lookup.arms.map(a=>option(a.id,armLabel(a)))}/><Picker label="Subject" value={subject} onChange={setSubject} options={lookup.subjects.map(s=>option(s.id,s.name))}/><Picker label="Term" value={term} onChange={setTerm} options={termsOf(lookup).map(t=>option(t.id,t.label))}/></div><DataState loading={state.isPending} error={state.error} retry={()=>void state.refetch()}>{sheet?<section className="card space-y-4 p-5"><div className="flex flex-wrap justify-between"><h2 className="text-xl font-semibold">{sheet.subject.name} · {armLabel(sheet.arm)}</h2><span>{sheet.submission?.status??'DRAFT'}</span></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead><tr><th>Student</th>{sheet.components.map(c=><th key={c.id}>{c.name}<br/><small>/{c.maxScore}</small></th>)}</tr></thead><tbody>{sheet.roster.map(e=><tr key={e.id} className="border-t"><td className="py-3">{e.student.fullName}<br/><small>{e.student.regNumber}</small></td>{sheet.components.map(c=><td key={c.id}><Input aria-label={`${e.student.fullName} ${c.name}`} type="number" min={0} max={c.maxScore} step="0.01" value={value(e.id,c.id)} disabled={!sheet.editable} onChange={event=>setDraft(old=>({...old,[`${e.id}:${c.id}`]:event.target.value}))}/><small>{sheet.scores.find(s=>s.enrollmentId===e.id&&s.componentId===c.id)?.source}</small></td>)}</tr>)}</tbody></table></div>{sheet.submission&&['APPROVED','PUBLISHED'].includes(sheet.submission.status)&&<div><Label htmlFor="score-reason">Correction reason</Label><Input id="score-reason" value={reason} onChange={e=>setReason(e.target.value)}/></div>}<div className="flex flex-wrap gap-2"><Action label="Save scores" run={save}/>{sheet.submission?.status==='DRAFT'&&<Action label="Submit scores" run={()=>apiClient.post('scores',{op:'transition',submissionId:sheet.submission!.id,action:'SUBMIT'})}/>}</div></section>:<p className="card p-5">Choose class, subject and term.</p>}</DataState></div>}

type Submission={id:string;status:string;subject:{name:string};classArm:{level:string;name:string}}
type Report={id:string;total:string;average:string;position:number;status:string;teacherRemark:string|null;principalRemark:string|null;snapshot:{student:string;admissionNumber:string;term:string;subjects:{name:string;total:number;grade:string}[]}}
export function ReportsScreen(){return <PageFrame title="Results & report cards" description="Approve complete subject submissions, publish class results, add remarks and export report cards.">{()=> <LookupState>{lookup=><ReportsPanel lookup={lookup}/>}</LookupState>}</PageFrame>}
function ReportsPanel({lookup}:{lookup:Lookup}){const apiClient=useSmsApi(),[arm,setArm]=useState(''),[term,setTerm]=useState('');const submissions=useData<{submissions:Submission[]}>(term?`submissions${query({termId:term})}`:null);const reports=useData<{reports:Report[]}>(arm&&term?`reports${query({classArmId:arm,termId:term})}`:null);return <div className="space-y-5"><div className="card grid gap-4 p-5 md:grid-cols-2"><Picker label="Class arm" value={arm} onChange={setArm} options={lookup.arms.map(a=>option(a.id,armLabel(a)))}/><Picker label="Term" value={term} onChange={setTerm} options={termsOf(lookup).map(t=>option(t.id,t.label))}/></div><section className="card space-y-4 p-5"><h2 className="text-xl font-semibold">Subject submissions</h2>{submissions.data?.submissions.filter(s=>!arm||s.classArm.level&&lookup.arms.find(a=>a.id===arm)?.level===s.classArm.level&&lookup.arms.find(a=>a.id===arm)?.name===s.classArm.name).map(s=><div key={s.id} className="flex flex-wrap items-center justify-between border-b py-3"><span>{s.subject.name} · {s.status}</span>{s.status==='SUBMITTED'&&<Action label="Approve" run={()=>apiClient.post('scores',{op:'transition',submissionId:s.id,action:'APPROVE'})}/>}</div>)}{arm&&term&&<Action label="Publish class results" run={()=>apiClient.post('reports',{op:'publish',classArmId:arm,termId:term})}/>}</section><DataState loading={reports.isPending} error={reports.error} retry={()=>void reports.refetch()}><div className="grid gap-4 lg:grid-cols-2">{reports.data?.reports.map(report=><article key={report.id} className="card space-y-3 p-5"><div className="flex justify-between"><h3 className="font-semibold">{report.position}. {report.snapshot.student}</h3><span>{report.status}</span></div><p>{report.snapshot.admissionNumber} · Average {report.average}% · Total {report.total}</p><ul className="text-sm">{report.snapshot.subjects.map(s=><li key={s.name}>{s.name}: {s.total} ({s.grade})</li>)}</ul><Remarks report={report}/><a className="btn-secondary" href={`${apiClient.base}report-pdf?id=${encodeURIComponent(report.id)}`}>Download PDF</a></article>)}</div></DataState></div>}
function Remarks({report}:{report:Report}){const apiClient=useSmsApi(),[teacherRemark,setTeacher]=useState(report.teacherRemark??''),[principalRemark,setPrincipal]=useState(report.principalRemark??'');return <div className="space-y-2"><Label>Teacher remark</Label><textarea className="w-full rounded border p-2" value={teacherRemark} onChange={e=>setTeacher(e.target.value)}/><Label>Principal remark</Label><textarea className="w-full rounded border p-2" value={principalRemark} onChange={e=>setPrincipal(e.target.value)}/><Action label="Save remarks" run={()=>apiClient.post('reports',{reportId:report.id,teacherRemark,principalRemark})}/></div>}

type BridgeExam={id:string;title:string;subject:string;classLevel:string;subjectId:string|null;termId:string|null;componentId:string|null;_count:{examSessions:number}}
export function BridgeScreen(){return <PageFrame title="Import CBT scores" description="Link a finished exam to the SMS calendar, choose BEST or LAST attempt, and import scaled marks.">{()=> <LookupState>{lookup=><BridgePanel lookup={lookup}/>}</LookupState>}</PageFrame>}
function BridgePanel({lookup}:{lookup:Lookup}){const apiClient=useSmsApi(),state=useData<{exams:BridgeExam[]}>('bridge');const [examId,setExam]=useState(''),exam=state.data?.exams.find(e=>e.id===examId);return <DataState loading={state.isPending} error={state.error} retry={()=>void state.refetch()}><div className="space-y-5"><div className="card p-5"><Picker label="Exam" value={examId} onChange={setExam} options={(state.data?.exams??[]).map(e=>option(e.id,`${e.title} · ${e.classLevel} · ${e._count.examSessions} sittings`))}/></div>{exam&&<div className="grid gap-5 lg:grid-cols-2"><EditForm title="Link exam" done={()=>{}} save={data=>apiClient.post('bridge',{op:'link',examId,...data})} fields={[{name:'subjectId',label:'Subject',type:'select',required:true,value:exam.subjectId,options:lookup.subjects.map(s=>option(s.id,s.name))},{name:'termId',label:'Term',type:'select',required:true,value:exam.termId,options:termsOf(lookup).map(t=>option(t.id,t.label))},{name:'componentId',label:'Default component',type:'select',value:exam.componentId,options:lookup.components.map(c=>option(c.id,`${c.name} / ${c.maxScore}`))}]}/><EditForm title="Import attempts" submitLabel="Import CBT scores" done={()=>{}} save={data=>apiClient.post('bridge',{examId,...data})} fields={[{name:'componentId',label:'Target component',type:'select',required:true,options:lookup.components.map(c=>option(c.id,`${c.name} / ${c.maxScore}`))},{name:'attemptRule',label:'Attempt rule',type:'select',required:true,options:[option('BEST','Best attempt'),option('LAST','Last attempt')]}]}/></div>}</div></DataState>}

export function StaffDashboardScreen(){return <PageFrame title="School dashboard" description="Current enrollment, attendance, assignments and result-submission progress.">{()=> <DashboardPanel/>}</PageFrame>}
type StaffDashboard={totals:{students:number;staff:number}|null;attendance:{rate:number|null};work:{id:string;teacher:{id:string;fullName:string};classArm:string;subject:string;status:string}[];formArms:{id:string}[];teacherProgress:{teacher:{id:string;fullName:string};expected:number;submitted:number;approved:number}[]}
function DashboardPanel() {
  const state = useData<StaffDashboard>('dashboard')
  return <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>
    {state.data && <div className="space-y-6">
      {state.data.totals && <div className="grid gap-4 sm:grid-cols-2">
        <Metric label="Total students" value={state.data.totals.students.toLocaleString()} />
        <Metric label="Total staff" value={state.data.totals.staff.toLocaleString()} />
      </div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Attendance rate" value={state.data.attendance.rate === null ? '—' : `${state.data.attendance.rate}%`} />
        <Metric label="Assignments" value={state.data.work.length} />
        <Metric label="Form classes" value={state.data.formArms.length} />
      </div>
      <section className="card p-5"><h2 className="text-xl font-semibold">Score-entry status</h2>{state.data.work.map(work => <p key={work.id} className="border-b py-2">{work.teacher.fullName} · {work.classArm} · {work.subject}: <strong>{work.status}</strong></p>)}</section>
      <section className="card p-5"><h2 className="text-xl font-semibold">Teacher progress</h2>{state.data.teacherProgress.map(progress => <p key={progress.teacher.id}>{progress.teacher.fullName}: {progress.submitted}/{progress.expected} submitted, {progress.approved} approved</p>)}</section>
    </div>}
  </DataState>
}
function Metric({label,value}:{label:string;value:string|number}){return <div className="card p-5"><p className="text-sm text-on-surface-variant">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>}

type StudentDashboard={enrollment:{classArm:{level:string;name:string}}|null;reports:Report[];attendance:{summary:{rate:number|null};terms:{term:{id:string;name:string;academicSession:{name:string}};present:number;late:number;absent:number}[]}}
export function StudentHomeScreen(){const state=useData<StudentDashboard>('dashboard');const apiClient=useSmsApi();return <div className="space-y-6"><header><p className="text-sm font-semibold text-primary">School management</p><h1 className="text-headline-lg-mobile font-semibold md:text-headline-lg">My school records</h1></header><DataState loading={state.isPending} error={state.error} retry={()=>void state.refetch()}>{state.data?<><div className="grid gap-4 sm:grid-cols-3"><Metric label="Class" value={state.data.enrollment?armLabel(state.data.enrollment.classArm):'—'}/><Metric label="Published reports" value={state.data.reports.length}/><Metric label="Attendance rate" value={state.data.attendance.summary.rate===null?'—':`${state.data.attendance.summary.rate}%`}/></div><section className="space-y-4"><h2 className="text-xl font-semibold">Published results</h2>{state.data.reports.map(report=><article key={report.id} className="card p-5"><h3 className="font-semibold">{report.snapshot.term} · Position {report.position}</h3><p>Average {report.average}%</p><a className="btn-secondary mt-3" href={`${apiClient.base}report-pdf?id=${report.id}`}>Download report card</a></article>)}</section><section className="card p-5"><h2 className="text-xl font-semibold">Attendance summary</h2>{state.data.attendance.terms.map(term=><p key={term.term.id}>{term.term.academicSession.name} · {term.term.name}: {term.present} present, {term.late} late, {term.absent} absent</p>)}</section></>:null}</DataState></div>}
