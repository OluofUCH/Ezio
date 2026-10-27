'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { SchoolGate } from '@/components/staff/SchoolGate'
import { useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage } from '@/lib/client/api'
import { classLevelLabel, examModeLabel } from '@/lib/client/format'
import {
  CLASS_LEVELS,
  EXAM_MODES,
  type ClassLevel,
  type Exam,
  type ExamMode,
} from '@/lib/client/types'

export function NewExamPage() {
  return (
    <SchoolGate>
      <NewExamForm />
    </SchoolGate>
  )
}

type CreatedExam = { exam: Exam; nextSteps: Record<string, string> }

function NewExamForm() {
  const router = useRouter()
  const { withScope } = useScope()

  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [classLevel, setClassLevel] = useState<ClassLevel | ''>('')
  const [durationMins, setDurationMins] = useState('60')
  const [maxAttempts, setMaxAttempts] = useState('1')
  const [mode, setMode] = useState<ExamMode>('HYBRID')
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [shuffleOptions, setShuffleOptions] = useState(true)
  const [startWindow, setStartWindow] = useState('')
  const [endWindow, setEndWindow] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      const created = await api.post<CreatedExam>(withScope('/api/exams'), {
        title,
        subject,
        classLevel,
        durationMins: Number(durationMins),
        maxAttempts: Number(maxAttempts),
        mode,
        shuffleQuestions,
        shuffleOptions,
        startWindow: toIso(startWindow),
        endWindow: toIso(endWindow),
      })

      // An exam is created unpublished and with no questions, so the only useful next
      // step is its management page — where the spreadsheet gets uploaded.
      router.replace(`/staff/exams/${created.exam.id}`)
    } catch (err) {
      if (err instanceof ApiClientError) setFieldErrors(err.fieldErrors())
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/staff/exams"
          className="mb-3 inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-on-surface"
        >
          <Icon name="arrow_back" size={18} />
          Back to exams
        </Link>
        <h1 className="font-headline-lg text-headline-lg-mobile text-on-surface md:text-headline-lg">
          Exam Builder
        </h1>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Set the paper up here. You will add questions on the next screen, then publish.
        </p>
      </header>

      {error ? (
        <Alert tone="danger" title="Could not create the exam" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <form onSubmit={submit} className="space-y-6" noValidate>
        <section className="glass-card rounded-xl p-6 md:p-8">
          <h2 className="mb-6 flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
            <Icon name="settings_suggest" className="text-primary" />
            Exam metadata
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2">
              <Label htmlFor="title">Exam title</Label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Mid-Term Mathematics JSS 3"
                required
                className="field"
                aria-describedby={fieldErrors.title ? 'title-error' : undefined}
              />
              <FieldError id="title-error" message={fieldErrors.title} />
            </div>

            <div>
              <Label htmlFor="subject">Subject</Label>
              <input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="e.g. Mathematics"
                required
                className="field"
              />
              <FieldError id="subject-error" message={fieldErrors.subject} />
            </div>

            <div>
              <Label htmlFor="classLevel">Class level</Label>
              <select
                id="classLevel"
                value={classLevel}
                onChange={(event) => setClassLevel(event.target.value as ClassLevel)}
                required
                className="field"
              >
                <option value="" disabled>
                  Select class
                </option>
                {CLASS_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {classLevelLabel(level)}
                  </option>
                ))}
              </select>
              <FieldError id="classLevel-error" message={fieldErrors.classLevel} />
              <p className="mt-1 font-label-sm text-label-sm text-outline">
                Only students in this class will see or be able to start the exam.
              </p>
            </div>

            <div>
              <Label htmlFor="durationMins">Duration (minutes)</Label>
              <input
                id="durationMins"
                type="number"
                min={5}
                max={480}
                value={durationMins}
                onChange={(event) => setDurationMins(event.target.value)}
                required
                className="field"
              />
              <FieldError id="durationMins-error" message={fieldErrors.durationMins} />
            </div>

            <div>
              <Label htmlFor="maxAttempts">Attempt limit</Label>
              <input
                id="maxAttempts"
                type="number"
                min={1}
                max={10}
                value={maxAttempts}
                onChange={(event) => setMaxAttempts(event.target.value)}
                required
                className="field"
              />
              <FieldError id="maxAttempts-error" message={fieldErrors.maxAttempts} />
            </div>

            <div className="lg:col-span-3">
              <Label htmlFor="mode">Delivery mode</Label>
              <div className="flex flex-wrap gap-3">
                {EXAM_MODES.map((option) => (
                  <label key={option} className="cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      value={option}
                      checked={mode === option}
                      onChange={() => setMode(option)}
                      className="peer sr-only"
                    />
                    <span className="block rounded-full border border-outline-variant bg-surface px-6 py-3 font-label-md text-label-md text-on-surface-variant shadow-sm transition-all peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:text-on-surface peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                      {examModeLabel(option)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="glass-card rounded-xl p-6 md:p-8">
          <h2 className="mb-6 flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
            <Icon name="schedule" className="text-primary" />
            Availability window
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <Label htmlFor="startWindow">Opens</Label>
              <input
                id="startWindow"
                type="datetime-local"
                value={startWindow}
                onChange={(event) => setStartWindow(event.target.value)}
                className="field"
              />
            </div>
            <div>
              <Label htmlFor="endWindow">Closes</Label>
              <input
                id="endWindow"
                type="datetime-local"
                value={endWindow}
                onChange={(event) => setEndWindow(event.target.value)}
                className="field"
              />
              <FieldError id="endWindow-error" message={fieldErrors.endWindow} />
            </div>
          </div>

          <p className="mt-4 font-label-sm text-label-sm text-outline">
            Leave both blank to make the exam available as soon as it is published. Outside the
            window students still see the exam listed, marked as scheduled or closed.
          </p>
        </section>

        <section className="glass-card rounded-xl p-6 md:p-8">
          <h2 className="mb-6 flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
            <Icon name="shuffle" className="text-primary" />
            Anti-malpractice
          </h2>

          <div className="space-y-4">
            <Toggle
              id="shuffleQuestions"
              checked={shuffleQuestions}
              onChange={setShuffleQuestions}
              label="Shuffle question order per student"
              hint="Seeded by student and exam, so the same student always sees the same order — reproducible for review."
            />
            <Toggle
              id="shuffleOptions"
              checked={shuffleOptions}
              onChange={setShuffleOptions}
              label="Shuffle option order per student"
              hint="Makes answer-sharing by option letter useless between neighbours."
            />
          </div>
        </section>

        <div className="flex flex-col justify-end gap-3 border-t border-outline-variant pt-6 sm:flex-row">
          <Link href="/staff/exams" className="btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={busy} className="btn-primary px-8">
            {busy ? <Spinner size={20} /> : <Icon name="save" size={20} />}
            {busy ? 'Creating…' : 'Create and add questions'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * `datetime-local` yields `YYYY-MM-DDTHH:mm` with no zone. Sending that verbatim would let
 * the server's `z.coerce.date()` resolve it against the *server's* timezone — so an exam a
 * teacher in Lagos schedules for 09:00 would open at 09:00 UTC on a cloud host, an hour
 * early. Converting here anchors it to the browser's zone, which is the one the teacher
 * was reading when they typed it.
 */
function toIso(localValue: string): string | null {
  if (!localValue) return null
  const parsed = new Date(localValue)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block font-label-md text-label-md text-on-surface-variant">
      {children}
    </label>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 font-label-sm text-label-sm text-error">
      {message}
    </p>
  )
}

function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded accent-[#4a6700]"
      />
      <span>
        <span className="block font-label-md text-label-md text-on-surface">{label}</span>
        {hint ? (
          <span className="mt-0.5 block font-label-sm text-label-sm text-on-surface-variant">{hint}</span>
        ) : null}
      </span>
    </label>
  )
}
