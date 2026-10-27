import { ok, maxImportRows, maxUploadBytes, readQuery, readUpload, route } from '@/lib/api'
import { forbidden, unprocessable } from '@/lib/errors'
import { canManageSchool, requireSchoolScope } from '@/lib/auth/session'
import { WorkbookFormatError, type RowIssue } from '@/lib/import/questions-xlsx'
import { parseRosterFile } from '@/lib/import/students-csv'
import { importStudentsQuerySchema } from '@/lib/validation/student'
import { badRequest } from '@/lib/errors'

export const runtime = 'nodejs'

/**
 * POST /api/students/import — bulk roster enrolment (PRD §3.1 step 3).
 *
 * All-or-nothing. Every row is validated against the file and against the existing
 * roster before anything is written; one bad row means nothing is committed and the
 * full error report comes back. A partial import is the worst outcome here — an
 * admin cannot tell which of 300 students made it in, and re-uploading the fixed
 * file would collide with the rows that did.
 *
 * `?dryRun=true` runs the identical validation and reports without writing.
 *
 * Accepts .csv (the documented format) and .xlsx, since an admin who has the roster
 * in Excel will try to upload it directly and SheetJS reads both.
 */
export const POST = route(async (req) => {
  const { db, session } = await requireSchoolScope(req)

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school administrator can import a student roster.')
  }

  const { dryRun } = readQuery(req, importStudentsQuerySchema)

  const { filename, buffer } = await readUpload(req, 'file', {
    allowedExtensions: ['.csv', '.xlsx', '.xls'],
    maxBytes: maxUploadBytes(),
  })

  let report
  try {
    report = parseRosterFile(buffer, { maxRows: maxImportRows() })
  } catch (err) {
    // A structural problem (missing column, empty sheet) is not a row-level error —
    // there is nothing to report per row, so it is a 400 with the reason.
    if (err instanceof WorkbookFormatError) throw badRequest(err.detail, 'MALFORMED_BODY')
    throw err
  }

  /**
   * Collision check against the roster already in the database. Done in one query
   * rather than per row, and scoped to this school by the tenant client — the same
   * reg number in another school is not a collision.
   */
  const candidateRegNumbers = report.valid.map((row) => row.regNumber)
  const existing = candidateRegNumbers.length
    ? await db.student.findMany({
        where: { regNumber: { in: candidateRegNumbers } },
        select: { regNumber: true, fullName: true },
      })
    : []

  const existingByReg = new Map(existing.map((student) => [student.regNumber, student.fullName]))

  const collisionErrors: RowIssue[] = []
  const importable = report.valid.filter((row) => {
    const clash = existingByReg.get(row.regNumber)
    if (!clash) return true
    collisionErrors.push({
      row: row.row,
      column: 'regNumber',
      code: 'ALREADY_ENROLLED',
      message: `${row.regNumber} is already enrolled as ${clash}.`,
    })
    return false
  })

  const errors = [...report.errors, ...collisionErrors].sort((a, b) => a.row - b.row)

  const summary = {
    filename,
    totalRows: report.summary.totalRows,
    validRows: importable.length,
    invalidRows: report.summary.totalRows - importable.length,
    warningCount: report.summary.warningCount,
  }

  const warnings = report.valid.flatMap((row) => row.warnings)

  if (errors.length > 0) {
    // 422 with the full report. Nothing has been written.
    throw unprocessable(
      `${errors.length} problem${errors.length === 1 ? '' : 's'} found across ${summary.invalidRows} row${summary.invalidRows === 1 ? '' : 's'}. Nothing was imported — fix the file and upload again.`,
      'IMPORT_VALIDATION_FAILED',
      { summary, errors, warnings },
    )
  }

  if (dryRun) {
    return ok({
      dryRun: true,
      summary,
      warnings,
      // No PINs in a dry run — nothing has been assigned yet, and the generated
      // values here are discarded rather than persisted.
      preview: importable.map((row) => ({
        row: row.row,
        regNumber: row.regNumber,
        fullName: row.fullName,
        classLevel: row.classLevel,
        pinWillBeGenerated: row.pinGenerated,
      })),
    })
  }

  /**
   * `createMany` inside a transaction. One statement for the whole roster, and the
   * transaction means a unique-constraint violation from a concurrent import rolls
   * the entire batch back rather than leaving it half-applied.
   *
   * `schoolId` is stamped on every row by the tenant extension.
   */
  const result = await db.$transaction(async (tx) => {
    return tx.student.createMany({
      data: importable.map((row) => ({
        regNumber: row.regNumber,
        fullName: row.fullName,
        classLevel: row.classLevel,
        pin: row.pin,
      })) as never,
    })
  })

  return ok({
    imported: result.count,
    summary,
    warnings,
    /**
     * The credential list, returned once. This is what the admin prints and hands
     * out. PINs remain readable afterwards via the roster endpoints (SCHOOL_ADMIN
     * only), so this is a convenience rather than the sole opportunity.
     */
    credentials: importable.map((row) => ({
      regNumber: row.regNumber,
      fullName: row.fullName,
      classLevel: row.classLevel,
      pin: row.pin,
      pinGenerated: row.pinGenerated,
    })),
  })
})
