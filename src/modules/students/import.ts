import type { NextRequest } from 'next/server'
import type { ScopedStaffContext } from '@/lib/auth/session'
import { ok, readUpload, readQuery, maxUploadBytes, maxImportRows } from '@/lib/api'
import { badRequest, unprocessable } from '@/lib/errors'
import { parseRosterFile } from '@/lib/import/students-csv'
import { WorkbookFormatError, type RowIssue } from '@/lib/import/questions-xlsx'
import { importStudentsQuerySchema } from '@/lib/validation/student'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { createRosterStudents, rosterArmIssues } from './service'

export async function importStudentRoster(req: NextRequest, context: ScopedStaffContext) {
  assertSchoolAdministrator(context)
  const { dryRun } = readQuery(req, importStudentsQuerySchema)
  const { filename, buffer } = await readUpload(req, 'file', { allowedExtensions: ['.csv', '.xlsx', '.xls'], maxBytes: maxUploadBytes() })
  let report
  try { report = parseRosterFile(buffer, { maxRows: maxImportRows() }) } catch (error) {
    if (error instanceof WorkbookFormatError) throw badRequest(error.detail, 'MALFORMED_BODY')
    throw error
  }
  const existing = await context.db.student.findMany({ where: { regNumber: { in: report.valid.map((row) => row.regNumber) } }, select: { regNumber: true, fullName: true } })
  const errors: RowIssue[] = [...report.errors, ...await rosterArmIssues(context.db, context.schoolId, report.valid)]
  for (const row of report.valid) {
    const clash = existing.find((student) => student.regNumber === row.regNumber)
    if (clash) errors.push({ row: row.row, column: 'regNumber', code: 'ALREADY_ENROLLED', message: `${row.regNumber} is already enrolled as ${clash.fullName}.` })
  }
  errors.sort((a, b) => a.row - b.row)
  const invalid = new Set(errors.map((e) => e.row)).size
  const summary = { filename, totalRows: report.summary.totalRows, validRows: report.summary.totalRows - invalid, invalidRows: invalid, warningCount: report.summary.warningCount }
  const warnings = report.valid.flatMap((row) => row.warnings)
  if (errors.length) throw unprocessable('Fix the reported rows and upload again. Nothing was imported.', 'IMPORT_VALIDATION_FAILED', { summary, errors, warnings })
  if (dryRun) return ok({ dryRun: true, summary, warnings, preview: report.valid.map((row) => ({ row: row.row, regNumber: row.regNumber, fullName: row.fullName, classLevel: row.classLevel, arm: row.arm, pinWillBeGenerated: row.pinGenerated })) })
  const result = await createRosterStudents(context, report.valid.map(({ regNumber, fullName, classLevel, pin, arm }) => ({ regNumber, fullName, classLevel, pin, arm })))
  return ok({ imported: result.count, summary, warnings, credentials: report.valid.map(({ regNumber, fullName, classLevel, pin, arm, pinGenerated }) => ({ regNumber, fullName, classLevel, pin, arm, pinGenerated })) })
}
