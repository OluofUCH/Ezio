'use client'

import { useRef, useState } from 'react'
import { Alert, Badge } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { useScope } from '@/components/staff/ScopeProvider'
import { api, errorMessage } from '@/lib/client/api'
import { formatBytes } from '@/lib/client/format'
import type { ImportResult, UploadPreview } from '@/lib/client/types'

const LETTERS = ['A', 'B', 'C', 'D'] as const

/**
 * Bulk question upload — PRD §4.2a.
 *
 * Two distinct server calls, and keeping them distinct is the point: `/upload` parses and
 * validates but **writes nothing**, and `/import` commits. So a teacher always sees a
 * row-by-row verdict before anything reaches the exam, and a file with 47 good rows and 3
 * bad ones is never partially imported.
 *
 * The preview rows are sent back to `/import` verbatim. They are re-validated there against
 * the same schema the parser used, so nothing is trusted on the strength of having been
 * through `/upload` — which is why this component can hand them back unmodified.
 */
export function QuestionUpload({
  examId,
  existingCount,
  hasSittings,
  onImported,
}: {
  examId: string
  existingCount: number
  /** REPLACE is refused server-side once any session exists — it would orphan answers. */
  hasSittings: boolean
  onImported: () => void
}) {
  const { withScope } = useScope()
  const inputRef = useRef<HTMLInputElement>(null)

  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<UploadPreview | null>(null)
  const [imported, setImported] = useState<ImportResult | null>(null)
  const [mode, setMode] = useState<'APPEND' | 'REPLACE'>('APPEND')

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    setPreview(null)
    setImported(null)

    try {
      const form = new FormData()
      form.set('file', file)
      const result = await api.post<UploadPreview>(
        withScope(`/api/exams/${examId}/questions/upload`),
        form,
      )
      setPreview(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  async function commit() {
    if (!preview || preview.valid.length === 0) return

    setImporting(true)
    setError(null)

    try {
      const result = await api.post<ImportResult>(withScope(`/api/exams/${examId}/questions/import`), {
        mode,
        rows: preview.valid.map((row) => row.question),
      })
      setImported(result)
      setPreview(null)
      onImported()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="danger" title="Upload failed" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {imported ? (
        <Alert tone="success" title="Questions imported" onDismiss={() => setImported(null)}>
          Added {imported.imported} question{imported.imported === 1 ? '' : 's'}
          {imported.replacedQuestions > 0
            ? `, replacing ${imported.replacedQuestions}`
            : ''}
          . The exam now has {imported.totalQuestions} questions worth {imported.totalPoints} marks.{' '}
          {imported.nextStep}
        </Alert>
      ) : null}

      {/* Dropzone */}
      <section className="glass-card rounded-xl p-6 md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
            <Icon name="upload_file" className="text-primary" />
            Upload questions
          </h3>
          <a
            href="/api/templates/questions.xlsx"
            className="flex items-center gap-1 font-label-md text-label-md text-on-surface underline underline-offset-2 transition-colors hover:text-primary"
          >
            <Icon name="download" size={18} />
            Download .xlsx template
          </a>
        </div>

        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-[#F9FAFB] p-8 text-center transition-all md:p-12 ${
            dragging ? 'drag-active' : 'border-outline-variant hover:border-primary-container hover:bg-surface-container'
          }`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault()
            setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files[0]
            if (file) void upload(file)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
          }}
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/20">
            {uploading ? (
              <Spinner size={28} className="text-primary" />
            ) : (
              <Icon name="cloud_upload" size={30} className="text-primary" />
            )}
          </div>
          <h4 className="font-headline-md text-headline-md text-on-surface">
            {uploading ? 'Checking your spreadsheet…' : 'Drag and drop your spreadsheet here'}
          </h4>
          <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
            .xlsx or .xls · nothing is saved until you confirm the preview
          </p>
          <span className="btn-secondary mt-6">Browse files</span>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              // Reset so re-selecting the same filename fires change again.
              event.target.value = ''
            }}
          />
        </div>
      </section>

      {/* Preview */}
      {preview ? (
        <section className="glass-card rounded-xl p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <Icon name="preview" className="text-primary" />
              Review before importing
            </h3>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{preview.summary.validRows} ready</Badge>
              {preview.summary.invalidRows > 0 ? (
                <Badge tone="danger">{preview.summary.invalidRows} rejected</Badge>
              ) : null}
              {preview.summary.warningCount > 0 ? (
                <Badge tone="warning">{preview.summary.warningCount} warnings</Badge>
              ) : null}
            </div>
          </div>

          <p className="mb-6 font-body-md text-body-md text-on-surface-variant">
            {preview.file.filename} · {formatBytes(preview.file.sizeBytes)} ·{' '}
            {preview.summary.totalRows} rows read. Nothing has been saved yet.
          </p>

          {/* Rejected rows first — these are what the teacher must act on. */}
          {preview.errors.length > 0 ? (
            <div className="mb-6 rounded-lg border border-error/30 bg-error-container/30 p-4">
              <h4 className="flex items-center gap-2 font-label-md text-label-md font-bold text-on-error-container">
                <Icon name="error" size={18} />
                {preview.summary.invalidRows} row{preview.summary.invalidRows === 1 ? '' : 's'} will
                not be imported
              </h4>
              <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto custom-scrollbar">
                {preview.errors.map((issue, position) => (
                  <li
                    key={`${issue.row}-${issue.column}-${position}`}
                    className="font-body-md text-body-md text-on-error-container"
                  >
                    <strong>
                      Row {issue.row}, {issue.column}:
                    </strong>{' '}
                    {issue.message}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-label-sm text-label-sm text-on-error-container">
                Fix these in your spreadsheet and upload again, or import just the valid rows below.
              </p>
            </div>
          ) : null}

          {preview.valid.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-lg border border-outline-variant">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-outline-variant bg-surface-container-high">
                      <th className="w-12 p-3 text-center font-label-md text-label-md font-bold text-on-surface">
                        Row
                      </th>
                      <th className="min-w-[260px] p-3 font-label-md text-label-md font-bold text-on-surface">
                        Question
                      </th>
                      <th className="min-w-[200px] p-3 font-label-md text-label-md font-bold text-on-surface">
                        Options
                      </th>
                      <th className="w-24 p-3 font-label-md text-label-md font-bold text-on-surface">
                        Correct
                      </th>
                      <th className="w-20 p-3 text-center font-label-md text-label-md font-bold text-on-surface">
                        Marks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {preview.valid.map((row) => {
                      const correct = row.question.options
                        .map((option, position) => (option.isCorrect ? (LETTERS[position] ?? '?') : null))
                        .filter(Boolean)
                        .join(', ')

                      return (
                        <tr
                          key={row.row}
                          className={`transition-colors hover:bg-surface-container/50 ${
                            row.warnings.length > 0 ? 'bg-[#fffbeb]' : ''
                          }`}
                        >
                          <td className="p-3 text-center font-body-md text-body-md text-on-surface-variant">
                            {row.row}
                          </td>
                          <td className="p-3 font-body-md text-body-md text-on-surface">
                            {row.question.text}
                            {row.warnings.length > 0 ? (
                              <ul className="mt-1 space-y-0.5">
                                {row.warnings.map((warning, position) => (
                                  <li
                                    key={position}
                                    className="font-label-sm text-label-sm text-[#92400e]"
                                  >
                                    ⚠ {warning.message}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                          <td className="p-3">
                            <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                              {row.question.options.map((option, position) => (
                                <span
                                  key={position}
                                  className={`font-label-sm text-label-sm ${
                                    option.isCorrect
                                      ? 'font-bold text-on-primary-container'
                                      : 'text-on-surface-variant'
                                  }`}
                                >
                                  {LETTERS[position] ?? '?'}) {option.text}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 font-label-md text-label-md font-bold text-on-surface">
                            {correct}
                          </td>
                          <td className="p-3 text-center font-body-md text-body-md text-on-surface-variant">
                            {row.question.points}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Import mode */}
              <fieldset className="mt-6">
                <legend className="mb-3 font-label-md text-label-md text-on-surface-variant">
                  How should these be added?
                </legend>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'APPEND'}
                      onChange={() => setMode('APPEND')}
                      className="mt-1 h-4 w-4 accent-[#4a6700]"
                    />
                    <span>
                      <span className="block font-label-md text-label-md text-on-surface">
                        Add to the existing {existingCount} question{existingCount === 1 ? '' : 's'}
                      </span>
                      <span className="block font-label-sm text-label-sm text-on-surface-variant">
                        Numbering continues from the end of the current paper.
                      </span>
                    </span>
                  </label>

                  <label
                    className={`flex items-start gap-3 ${
                      hasSittings ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'REPLACE'}
                      disabled={hasSittings}
                      onChange={() => setMode('REPLACE')}
                      className="mt-1 h-4 w-4 accent-[#4a6700]"
                    />
                    <span>
                      <span className="block font-label-md text-label-md text-on-surface">
                        Replace the whole paper
                      </span>
                      <span className="block font-label-sm text-label-sm text-on-surface-variant">
                        {hasSittings
                          ? 'Unavailable — students have already sat this exam, and replacing the questions would orphan their recorded answers.'
                          : 'Deletes the current questions first.'}
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
                <button type="button" onClick={() => setPreview(null)} className="btn-secondary">
                  Discard
                </button>
                <button type="button" onClick={commit} disabled={importing} className="btn-primary">
                  {importing ? <Spinner size={20} /> : <Icon name="check" size={20} />}
                  {importing
                    ? 'Importing…'
                    : `Import ${preview.valid.length} question${preview.valid.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          ) : (
            <Alert tone="danger" title="Nothing can be imported from this file">
              Every row was rejected. Fix the problems listed above and upload again.
            </Alert>
          )}
        </section>
      ) : null}
    </div>
  )
}
