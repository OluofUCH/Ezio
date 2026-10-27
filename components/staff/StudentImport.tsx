'use client'

import { useRef, useState } from 'react'
import { Alert, Badge } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { useScope } from '@/components/staff/ScopeProvider'
import { ApiClientError, api, errorMessage } from '@/lib/client/api'
import { classLevelLabel } from '@/lib/client/format'
import type {
  StudentImportDryRun,
  StudentImportFailure,
  StudentImportResult,
} from '@/lib/client/types'

/**
 * Bulk roster import (PRD §4.5).
 *
 * Two passes over the same endpoint: `?dryRun=true` validates and previews, then the same
 * file is posted again to commit. The file is re-uploaded rather than the parsed rows being
 * echoed back — unlike the question importer — because the server generates each student's
 * PIN, and round-tripping credentials through the browser to save one upload would be a
 * poor trade.
 *
 * A validation failure arrives as a 422 with the row report attached, so `catch` is the
 * normal path for a bad file, not an exception to it.
 */
export function StudentImport({ onImported }: { onImported: () => void }) {
  const { withScope } = useScope()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<StudentImportFailure | null>(null)
  const [preview, setPreview] = useState<StudentImportDryRun | null>(null)
  const [result, setResult] = useState<StudentImportResult | null>(null)

  function reset() {
    setFile(null)
    setPreview(null)
    setFailure(null)
    setError(null)
  }

  async function send(candidate: File, dryRun: boolean) {
    setBusy(true)
    setError(null)
    setFailure(null)
    if (dryRun) setResult(null)

    try {
      const form = new FormData()
      form.set('file', candidate)

      if (dryRun) {
        const data = await api.post<StudentImportDryRun>(
          withScope('/api/students/import?dryRun=true'),
          form,
        )
        setPreview(data)
        setFile(candidate)
      } else {
        const data = await api.post<StudentImportResult>(withScope('/api/students/import'), form)
        setResult(data)
        setPreview(null)
        setFile(null)
        onImported()
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'IMPORT_VALIDATION_FAILED') {
        setFailure(err.details as StudentImportFailure)
        setError(err.message)
        setPreview(null)
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {result ? (
        <Alert tone="success" title={`Imported ${result.imported} students`} onDismiss={() => setResult(null)}>
          <p>Hand each student their registration number and PIN. You can re-read PINs from the roster below at any time.</p>
          <button
            type="button"
            onClick={() => downloadCredentials(result)}
            className="btn-primary mt-3"
          >
            <Icon name="download" size={20} />
            Download credential slips (CSV)
          </button>
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" title="Import failed" onDismiss={reset}>
          {error}
        </Alert>
      ) : null}

      {failure ? (
        <div className="rounded-lg border border-error/30 bg-error-container/30 p-4">
          <h4 className="font-label-md text-label-md font-bold text-on-error-container">
            {failure.errors.length} problem{failure.errors.length === 1 ? '' : 's'} in{' '}
            {failure.summary.filename} — nothing was imported
          </h4>
          <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto custom-scrollbar">
            {failure.errors.map((issue, position) => (
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
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-4 rounded-lg border border-primary-container bg-primary-container/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="font-label-md text-label-md font-bold text-on-primary-container">
              {preview.summary.validRows} students ready to enrol
            </h4>
            <Badge tone="primary">{preview.summary.filename}</Badge>
          </div>

          {preview.warnings.length > 0 ? (
            <ul className="space-y-1">
              {preview.warnings.slice(0, 8).map((warning, position) => (
                <li key={position} className="font-label-sm text-label-sm text-[#92400e]">
                  ⚠ Row {warning.row}: {warning.message}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-outline-variant bg-surface custom-scrollbar">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-surface-container-high">
                <tr className="font-label-sm text-label-sm text-on-surface">
                  <th className="p-3 font-semibold">Row</th>
                  <th className="p-3 font-semibold">Reg number</th>
                  <th className="p-3 font-semibold">Name</th>
                  <th className="p-3 font-semibold">Class</th>
                  <th className="p-3 font-semibold">PIN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {preview.preview.map((row) => (
                  <tr key={row.row}>
                    <td className="p-3 font-body-md text-body-md text-on-surface-variant">{row.row}</td>
                    <td className="p-3 font-body-md text-body-md text-on-surface">{row.regNumber}</td>
                    <td className="p-3 font-body-md text-body-md text-on-surface">{row.fullName}</td>
                    <td className="p-3 font-body-md text-body-md text-on-surface-variant">
                      {classLevelLabel(row.classLevel)}
                    </td>
                    <td className="p-3 font-label-sm text-label-sm text-on-surface-variant">
                      {row.pinWillBeGenerated ? 'auto-generated' : 'from file'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col justify-end gap-3 sm:flex-row">
            <button type="button" onClick={reset} className="btn-secondary">
              Discard
            </button>
            <button
              type="button"
              onClick={() => file && void send(file, false)}
              disabled={busy}
              className="btn-primary"
            >
              {busy ? <Spinner size={20} /> : <Icon name="group_add" size={20} />}
              {busy ? 'Enrolling…' : `Enrol ${preview.summary.validRows} students`}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-all ${
            dragging ? 'drag-active' : 'border-outline-variant bg-surface-container-low/50 hover:bg-surface-container-low'
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
            const dropped = event.dataTransfer.files[0]
            if (dropped) void send(dropped, true)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
          }}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface">
            {busy ? <Spinner size={22} /> : <Icon name="upload_file" size={22} />}
          </div>
          <p className="font-label-md text-label-md text-on-surface">
            {busy ? 'Checking your file…' : 'Click to upload or drag & drop'}
          </p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            CSV or XLSX · you will see a preview before anyone is enrolled
          </p>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const chosen = event.target.files?.[0]
              if (chosen) void send(chosen, true)
              event.target.value = ''
            }}
          />
        </div>
      )}

      <a
        href="/api/templates/students.csv"
        className="flex items-center justify-center gap-1 font-label-md text-label-md text-on-surface underline underline-offset-2 hover:text-primary"
      >
        <Icon name="download" size={18} />
        Download .csv template
      </a>
    </div>
  )
}

/** Credential slips as CSV, so the office can mail-merge or print them. */
function downloadCredentials(result: StudentImportResult) {
  const header = ['Reg Number', 'Full Name', 'Class', 'PIN']
  const rows = result.credentials.map((credential) => [
    credential.regNumber,
    credential.fullName,
    credential.classLevel,
    credential.pin,
  ])

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          // A PIN is all digits, but a leading-zero PIN would be eaten as a number by
          // Excel, and a name could begin with a formula character.
          const guarded = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell
          return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
        })
        .join(','),
    )
    .join('\r\n')

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'student-credentials.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
