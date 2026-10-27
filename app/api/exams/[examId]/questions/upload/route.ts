import { maxImportRows, maxUploadBytes, ok, readUpload, route } from '@/lib/api'
import { badRequest } from '@/lib/errors'
import { requireSchoolScope } from '@/lib/auth/session'
import { resolveEditableExam } from '@/lib/tenant'
import { WorkbookFormatError, parseQuestionWorkbook } from '@/lib/import/questions-xlsx'
import { parseParam } from '@/lib/validation/common'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * POST /api/exams/[examId]/questions/upload — parse, validate, preview.
 *
 * WRITES NOTHING. PRD §4.2a steps 2–4: the server validates every row, reports the
 * bad ones individually, and the teacher reviews the good ones before anything is
 * committed. Committing is `POST .../questions/import`.
 *
 * A response with `errors` present and `valid` non-empty is normal and useful — the
 * teacher sees which 3 of 50 rows are wrong and what is wrong with them, rather than
 * a single "invalid file" and no way to find the problem.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  // Checked before parsing: no point spending CPU on a spreadsheet for an exam whose
  // paper is already frozen.
  const exam = await resolveEditableExam(db, examId)

  const { filename, buffer } = await readUpload(req, 'file', {
    allowedExtensions: ['.xlsx', '.xls'],
    maxBytes: maxUploadBytes(),
  })

  let report
  try {
    report = parseQuestionWorkbook(buffer, { maxRows: maxImportRows() })
  } catch (err) {
    // Structural problems (no sheets, missing columns, too many rows) have no row to
    // attach to, so they are a 400 with the reason rather than a row report.
    if (err instanceof WorkbookFormatError) throw badRequest(err.detail, 'MALFORMED_BODY')
    throw err
  }

  const existingCount = await db.question.count({ where: { examId } })

  return ok({
    exam: { id: exam.id, title: exam.title, classLevel: exam.classLevel },
    file: { filename, sizeBytes: buffer.byteLength },
    summary: { ...report.summary, existingQuestions: existingCount },

    /**
     * Rows ready to commit. These are echoed back to `/import` verbatim, which
     * re-validates them with the same schema — so a client editing this payload
     * before confirming gains nothing.
     */
    valid: report.valid.map((row) => ({
      row: row.row,
      question: row.question,
      warnings: row.warnings,
    })),

    /** One entry per distinct problem, anchored to a spreadsheet row and column. */
    errors: report.errors,

    /**
     * Nothing has been saved. Stated explicitly because a response containing a
     * `summary` and a row list otherwise reads like a completed import.
     */
    committed: false,
    confirmEndpoint: `/api/exams/${examId}/questions/import`,
  })
})
