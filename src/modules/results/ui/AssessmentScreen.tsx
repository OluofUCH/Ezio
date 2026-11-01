'use client'

import { useId, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/lib/client/api'
import { Spinner } from '@/components/ui/Spinner'
import { Button, DataState, Input, Label, PageFrame, useData, useSmsApi } from '@/src/modules/workspace/ui/common'
import { assessmentSchema, type Grade } from '../rules'
import { GRADE_OPTIONS, REMARK_OPTIONS, STANDARD_GRADE_BANDS } from '../presets'

type Assessment = { components: { id: string; name: string; maxScore: number; orderIndex: number }[]; bands: Grade[] }
type BandDraft = { key: string; minScore: string; maxScore: string; grade: string; remark: string }
type ComponentDraft = { key: string; id?: string; name: string; maxScore: string }
const bandDraft = (band: Grade): BandDraft => ({ ...band, key: crypto.randomUUID(), minScore: String(band.minScore), maxScore: String(band.maxScore) })
const selectClass = 'min-h-11 w-full min-w-0 rounded-lg border border-outline bg-surface px-3 py-2'

export function AssessmentScreen() {
  return <PageFrame title="Assessment setup" description="Component maximums must total 100. Grade bands must cover every score from 0 to 100.">{() => <AssessmentPanel />}</PageFrame>
}

function AssessmentPanel() {
  const state = useData<Assessment>('assessment')
  return <DataState loading={state.isPending} error={state.error} retry={() => void state.refetch()}>{state.data && <AssessmentForm initial={state.data} />}</DataState>
}

function AssessmentForm({ initial }: { initial: Assessment }) {
  const api = useSmsApi(), client = useQueryClient(), id = useId(), problem = useRef<HTMLParagraphElement>(null)
  const [components, setComponents] = useState<ComponentDraft[]>(() => initial.components.map(component => ({ ...component, key: component.id, maxScore: String(component.maxScore) })))
  const [bands, setBands] = useState<BandDraft[]>(() => (initial.bands.length ? initial.bands : STANDARD_GRADE_BANDS).map(bandDraft))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const standard = bands.length === STANDARD_GRADE_BANDS.length && STANDARD_GRADE_BANDS.every(preset => bands.some(band => Number(band.minScore) === preset.minScore && Number(band.maxScore) === preset.maxScore && band.grade === preset.grade && band.remark === preset.remark))
  function updateBand(key: string, value: Partial<BandDraft>) { setSaved(false); setBands(current => current.map(band => band.key === key ? { ...band, ...value } : band)) }
  function showError(message: string) { setError(message); requestAnimationFrame(() => problem.current?.focus()) }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError(''); setSaved(false)
    const parsed = assessmentSchema.safeParse({
      components: components.map((component, orderIndex) => ({ id: component.id, name: component.name, maxScore: Number(component.maxScore), orderIndex })),
      bands: bands.map(({ minScore, maxScore, grade, remark }) => ({ minScore: Number(minScore), maxScore: Number(maxScore), grade, remark })),
    })
    if (!parsed.success) { showError(parsed.error.issues[0]?.message ?? 'Review the assessment settings.'); return }
    setBusy(true)
    try {
      const result = await api.post<Assessment>('assessment', parsed.data)
      setComponents(result.components.map(component => ({ ...component, key: component.id, maxScore: String(component.maxScore) })))
      setBands(result.bands.map(bandDraft)); setSaved(true)
      await client.invalidateQueries({ queryKey: api.key })
    } catch (failure) { if (!api.reportContextError(failure)) showError(errorMessage(failure)) }
    finally { setBusy(false) }
  }

  return <form onSubmit={save} aria-busy={busy} className="space-y-5">
    <fieldset disabled={busy} className="min-w-0 space-y-6">
      <legend className="sr-only">Assessment components and grade bands</legend>
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Components</h2><Button variant="outline" onClick={() => { setSaved(false); setComponents(current => [...current, { key: crypto.randomUUID(), name: '', maxScore: '' }]) }}>Add component</Button></div>
        {!components.length && <p className="text-sm text-on-surface-variant">Add your assessment components, such as CA and Exam, with maximums totalling 100.</p>}
        {components.map((component, index) => <div key={component.key} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
          <div className="space-y-2"><Label htmlFor={`${id}-${component.key}-name`}>Component {index + 1}</Label><Input id={`${id}-${component.key}-name`} required maxLength={80} value={component.name} onChange={event => { setSaved(false); setComponents(current => current.map(item => item.key === component.key ? { ...item, name: event.target.value } : item)) }} /></div>
          <div className="space-y-2"><Label htmlFor={`${id}-${component.key}-max`}>Maximum</Label><Input id={`${id}-${component.key}-max`} required type="number" min={0.01} max={100} step="0.01" value={component.maxScore} onChange={event => { setSaved(false); setComponents(current => current.map(item => item.key === component.key ? { ...item, maxScore: event.target.value } : item)) }} /></div>
          <Button variant="outline" aria-label={`Remove component ${index + 1}`} onClick={() => { setSaved(false); setComponents(current => current.filter(item => item.key !== component.key)) }}>Remove</Button>
        </div>)}
        <p className="font-semibold tabular-nums">Total: {components.reduce((sum, component) => sum + Number(component.maxScore || 0), 0).toFixed(2)} / 100</p>
      </section>
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Grade bands</h2><Button variant="outline" onClick={() => { setSaved(false); setBands(current => [...current, bandDraft({ minScore: 0, maxScore: 0, grade: '', remark: 'Pass' })]) }}>Add band</Button></div>
        <div className="max-w-md space-y-2"><Label htmlFor={`${id}-preset`}>Grade preset</Label><select id={`${id}-preset`} className={selectClass} value={standard ? 'AF' : 'CUSTOM'} onChange={event => { if (event.target.value === 'AF') { setBands(STANDARD_GRADE_BANDS.map(bandDraft)); setSaved(false) } }}>
          <option value="AF">A–F standard</option><option value="CUSTOM" disabled>Custom grade bands</option>
        </select></div>
        <p className="text-sm text-on-surface-variant">A–F values are preselected for a new setup. Review the ranges and remarks, then save. Existing saved grades are loaded as they are.</p>
        <div aria-hidden className="hidden gap-3 px-3 text-sm font-semibold sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)_auto]">
          <span>Min</span><span>Max</span><span>Grade</span><span>Remark</span><span className="w-20">Action</span>
        </div>
        {bands.map((band, index) => <GradeBandRow key={band.key} band={band} index={index} update={value => updateBand(band.key, value)} remove={() => { setSaved(false); setBands(current => current.filter(item => item.key !== band.key)) }} />)}
      </section>
      <p ref={problem} tabIndex={-1} role={error ? 'alert' : undefined} className="text-sm text-error">{error}</p>
      <p role="status" className="text-sm">{saved ? 'Assessment setup saved.' : ''}</p>
      <Button type="submit">{busy && <Spinner decorative size={16} />}Save assessment setup</Button>
    </fieldset>
  </form>
}

function GradeBandRow({ band, index, update, remove }: { band: BandDraft; index: number; update: (value: Partial<BandDraft>) => void; remove: () => void }) {
  const id = useId()
  const [customGrade, setCustomGrade] = useState(!GRADE_OPTIONS.some(grade => grade === band.grade))
  const [customRemark, setCustomRemark] = useState(!REMARK_OPTIONS.some(remark => remark === band.remark))
  return <fieldset className="grid min-w-0 items-start gap-3 rounded-lg border border-outline-variant p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.8fr)_auto]">
    <legend className="sr-only">Grade band {index + 1}</legend>
    <div className="space-y-2"><Label className="sm:sr-only" htmlFor={`${id}-min`}>Min</Label><Input id={`${id}-min`} aria-label={`Band ${index + 1} minimum`} required type="number" min={0} max={100} step="0.01" value={band.minScore} onChange={event => update({ minScore: event.target.value })} /></div>
    <div className="space-y-2"><Label className="sm:sr-only" htmlFor={`${id}-max`}>Max</Label><Input id={`${id}-max`} aria-label={`Band ${index + 1} maximum`} required type="number" min={0} max={100} step="0.01" value={band.maxScore} onChange={event => update({ maxScore: event.target.value })} /></div>
    <div className="space-y-2"><Label className="sm:sr-only" htmlFor={`${id}-grade`}>Grade</Label><select id={`${id}-grade`} aria-label={`Band ${index + 1} grade`} className={selectClass} value={customGrade ? 'CUSTOM' : band.grade} onChange={event => {
      const grade = event.target.value
      setCustomGrade(grade === 'CUSTOM')
      if (grade !== 'CUSTOM') { const preset = STANDARD_GRADE_BANDS.find(item => item.grade === grade)!; update({ grade, remark: preset.remark }); setCustomRemark(false) }
    }}>{GRADE_OPTIONS.map(grade => <option key={grade}>{grade}</option>)}<option value="CUSTOM">Custom…</option></select>
      {customGrade && <><Label htmlFor={`${id}-custom-grade`}>Custom grade</Label><Input id={`${id}-custom-grade`} required maxLength={12} value={band.grade} onChange={event => update({ grade: event.target.value })} /></>}
    </div>
    <div className="space-y-2"><Label className="sm:sr-only" htmlFor={`${id}-remark`}>Remark</Label><select id={`${id}-remark`} aria-label={`Band ${index + 1} remark`} className={selectClass} value={customRemark ? 'CUSTOM' : band.remark} onChange={event => { setCustomRemark(event.target.value === 'CUSTOM'); if (event.target.value !== 'CUSTOM') update({ remark: event.target.value }) }}>
      {REMARK_OPTIONS.map(remark => <option key={remark}>{remark}</option>)}<option value="CUSTOM">Custom…</option>
    </select>{customRemark && <><Label htmlFor={`${id}-custom-remark`}>Custom remark</Label><Input id={`${id}-custom-remark`} required maxLength={120} value={band.remark} onChange={event => update({ remark: event.target.value })} /></>}</div>
    <Button className="sm:w-20" variant="outline" aria-label={`Remove grade band ${index + 1}`} onClick={remove}>Remove</Button>
  </fieldset>
}
