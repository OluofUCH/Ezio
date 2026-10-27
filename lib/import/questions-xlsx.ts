import * as XLSX from 'xlsx'
import type { QuestionType } from '@prisma/client'
import { questionDraftSchema, type QuestionDraft } from '@/lib/validation/question'

/**
 * BULK QUESTION UPLOAD — PARSE AND VALIDATE (PRD §4.2a)
 * ====================================================
 *
 * A pure function: Buffer in, report out. No Prisma import, no request context —
 * so it is directly unit-testable, and the confirm-import endpoint can re-run the
 * exact same rules on the rows a client posts back.
 *
 * Nothing here writes. PRD §4.2a step 3 requires "a row-by-row error report (not a
 * silent partial import)", so a file with 47 good rows and 3 bad ones returns all
 * 50 verdicts and commits none of them; committing is a separate, explicit call.
 */

/* ------------------------------------------------------------------ *
 * Report shape
 * ------------------------------------------------------------------ */

export type RowIssue = {
  /** 1-based spreadsheet row as the teacher sees it in Excel (header is row 1). */
  row: number
  column: string
  code: string
  message: string
}

export type ParsedRow = {
  row: number
  question: QuestionDraft
  /** Non-blocking observations. The row still imports. */
  warnings: RowIssue[]
}

export type ParseReport = {
  summary: {
    totalRows: number
    validRows: number
    invalidRows: number
    warningCount: number
  }
  /** Ready to preview and commit. */
  valid: ParsedRow[]
  /** Excluded rows, one entry per distinct problem. */
  errors: RowIssue[]
}

export class WorkbookFormatError extends Error {
  readonly detail: string
  constructor(detail: string) {
    super(detail)
    this.name = 'WorkbookFormatError'
    this.detail = detail
  }
}

/* ------------------------------------------------------------------ *
 * Header handling
 * ------------------------------------------------------------------ */

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const
type OptionLetter = (typeof OPTION_LETTERS)[number]

export const TEMPLATE_HEADERS = [
  'question',
  'type',
  'optionA',
  'optionB',
  'optionC',
  'optionD',
  'correctOption',
  'points',
] as const

const REQUIRED_HEADERS = ['question', 'type', 'optionA', 'optionB', 'correctOption'] as const

/** `Option A`, `OPTIONA`, `option_a` all normalise to `optiona`. */
function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]/g, '')
}

/**
 * Question type spellings tolerated from a spreadsheet.
 *
 * A teacher typing `True/False` or `single` has made no real mistake, and failing
 * a 60-question upload over it just means they retype the column. The canonical
 * values are still what the template ships with.
 */
const TYPE_ALIASES: Record<string, QuestionType> = {
  SINGLECHOICE: 'SINGLE_CHOICE',
  SINGLE: 'SINGLE_CHOICE',
  SINGLEANSWER: 'SINGLE_CHOICE',
  MCQ: 'SINGLE_CHOICE',
  MULTIPLECHOICE: 'MULTIPLE_CHOICE',
  MULTIPLE: 'MULTIPLE_CHOICE',
  MULTI: 'MULTIPLE_CHOICE',
  MULTIANSWER: 'MULTIPLE_CHOICE',
  MULTIPLEANSWER: 'MULTIPLE_CHOICE',
  TRUEFALSE: 'TRUE_FALSE',
  TF: 'TRUE_FALSE',
  BOOLEAN: 'TRUE_FALSE',
}

function resolveType(raw: string): QuestionType | null {
  return TYPE_ALIASES[raw.trim().toUpperCase().replace(/[\s_\-/]/g, '')] ?? null
}

/* ------------------------------------------------------------------ *
 * Parse
 * ------------------------------------------------------------------ */

export function parseQuestionWorkbook(buffer: Buffer, opts: { maxRows?: number } = {}): ParseReport {
  const maxRows = opts.maxRows ?? 500

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      // Formulas, HTML and VBA are all irrelevant to a question list and are the
      // parts of the format with a history of parser problems. Reading values only
      // keeps the surface as small as the feature allows.
      cellFormula: false,
      cellHTML: false,
      cellDates: false,
      bookVBA: false,
      sheetStubs: false,
    })
  } catch (err) {
    throw new WorkbookFormatError(
      `The file could not be read as a spreadsheet. ${err instanceof Error ? err.message : ''}`.trim(),
    )
  }

  // First sheet only, per the template. Silently merging extra sheets would import
  // a teacher's scratch working alongside their real questions.
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new WorkbookFormatError('The workbook contains no sheets.')

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new WorkbookFormatError(`Sheet "${sheetName}" could not be read.`)

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '', // absent cell -> empty string, so every row has every key
    raw: false, // everything as a formatted string; avoids "1" vs 1 surprises
    blankrows: false,
  })

  if (rows.length === 0) {
    throw new WorkbookFormatError(
      `Sheet "${sheetName}" has a header row but no data rows. Fill in at least one question.`,
    )
  }

  if (rows.length > maxRows) {
    throw new WorkbookFormatError(
      `The file contains ${rows.length} rows; the limit is ${maxRows} per upload. Split it into smaller files.`,
    )
  }

  // Map normalised header -> the key SheetJS actually produced.
  const firstRow = rows[0] as Record<string, unknown>
  const headerMap = new Map<string, string>()
  for (const key of Object.keys(firstRow)) headerMap.set(normaliseHeader(key), key)

  const missing = REQUIRED_HEADERS.filter((header) => !headerMap.has(normaliseHeader(header)))
  if (missing.length > 0) {
    throw new WorkbookFormatError(
      `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected header row: ${TEMPLATE_HEADERS.join(', ')}.`,
    )
  }

  const cell = (row: Record<string, unknown>, header: string): string => {
    const key = headerMap.get(normaliseHeader(header))
    if (!key) return ''
    const value = row[key]
    return value === null || value === undefined ? '' : String(value).trim()
  }

  const valid: ParsedRow[] = []
  const errors: RowIssue[] = []
  let warningCount = 0

  // Detects the copy-paste duplicate that is easy to make and hard to spot in a
  // 60-row sheet. A warning, not an error — a teacher may legitimately repeat a
  // stem with different options.
  const seenQuestionText = new Map<string, number>()

  rows.forEach((row, index) => {
    const rowNumber = index + 2 // +1 for 0-index, +1 for the header row
    const rowErrors: RowIssue[] = []
    const warnings: RowIssue[] = []

    const err = (column: string, code: string, message: string) =>
      rowErrors.push({ row: rowNumber, column, code, message })
    const warn = (column: string, code: string, message: string) =>
      warnings.push({ row: rowNumber, column, code, message })

    /* -- question text -- */
    const text = cell(row, 'question')
    if (!text) err('question', 'QUESTION_REQUIRED', 'Question text is required.')
    if (text.length > 2000) {
      err('question', 'QUESTION_TOO_LONG', `Question text is ${text.length} characters; the limit is 2000.`)
    }

    /* -- type -- */
    const rawType = cell(row, 'type')
    let type: QuestionType | null = null
    if (!rawType) {
      err('type', 'TYPE_REQUIRED', 'Type is required — one of SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE.')
    } else {
      type = resolveType(rawType)
      if (!type) {
        err(
          'type',
          'TYPE_INVALID',
          `"${rawType}" is not a recognised type. Use SINGLE_CHOICE, MULTIPLE_CHOICE, or TRUE_FALSE.`,
        )
      }
    }

    /* -- options -- */
    const present: { letter: OptionLetter; text: string }[] = []
    const gaps: OptionLetter[] = []
    for (const letter of OPTION_LETTERS) {
      const optionText = cell(row, `option${letter}`)
      if (optionText) present.push({ letter, text: optionText })
      else if (present.length > 0) gaps.push(letter)
    }

    if (present.length < 2) {
      err(
        'optionA',
        'TOO_FEW_OPTIONS',
        `At least 2 options are required (found ${present.length}). optionA and optionB are mandatory.`,
      )
    }

    // C filled while B is blank means a column was shifted — worth flagging, since
    // the letters in `correctOption` would then point at the wrong text.
    const filledAfterGap = gaps.length > 0 && present.some((o) => OPTION_LETTERS.indexOf(o.letter) > OPTION_LETTERS.indexOf(gaps[0] as OptionLetter))
    if (filledAfterGap) {
      warn('optionB', 'OPTION_GAP', `Option ${gaps[0]} is blank but a later option is filled. Check for a shifted column.`)
    }

    if (type === 'TRUE_FALSE' && present.length > 2) {
      err(
        'optionC',
        'TRUE_FALSE_TOO_MANY_OPTIONS',
        `TRUE_FALSE takes only optionA and optionB (found ${present.length} options).`,
      )
    }

    /* -- correctOption -- */
    const rawCorrect = cell(row, 'correctOption')
    const correctLetters: OptionLetter[] = []
    if (!rawCorrect) {
      err('correctOption', 'CORRECT_OPTION_REQUIRED', 'correctOption is required, e.g. "B" or "A,C".')
    } else {
      const tokens = [...new Set(rawCorrect.toUpperCase().split(/[,;/|\s]+/).filter(Boolean))]
      for (const token of tokens) {
        if (!OPTION_LETTERS.includes(token as OptionLetter)) {
          err(
            'correctOption',
            'CORRECT_OPTION_NOT_A_LETTER',
            `"${token}" is not an option letter. Use A, B, C or D.`,
          )
          continue
        }
        const letter = token as OptionLetter
        if (!present.some((option) => option.letter === letter)) {
          err(
            'correctOption',
            'CORRECT_OPTION_MISSING',
            `correctOption "${letter}" refers to option${letter}, which is empty.`,
          )
          continue
        }
        correctLetters.push(letter)
      }
    }

    /* -- points -- */
    const rawPoints = cell(row, 'points')
    let points = 1
    if (rawPoints) {
      const parsed = Number(rawPoints)
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        err('points', 'POINTS_INVALID', `"${rawPoints}" is not a whole number.`)
      } else if (parsed < 1 || parsed > 100) {
        err('points', 'POINTS_OUT_OF_RANGE', `Points must be between 1 and 100 (found ${parsed}).`)
      } else {
        points = parsed
      }
    }

    /* -- warnings that need the assembled row -- */
    if (type === 'MULTIPLE_CHOICE' && correctLetters.length === 1) {
      warn(
        'correctOption',
        'MULTIPLE_CHOICE_SINGLE_ANSWER',
        'MULTIPLE_CHOICE with only one correct option behaves exactly like SINGLE_CHOICE.',
      )
    }

    if (type === 'TRUE_FALSE') {
      const looksBoolean = present.every((option) => /^(true|false|t|f|yes|no)$/i.test(option.text))
      if (!looksBoolean) {
        warn('optionA', 'TRUE_FALSE_UNUSUAL_OPTIONS', 'TRUE_FALSE options are usually "True" and "False".')
      }
    }

    if (text) {
      const key = text.toLowerCase()
      const firstSeen = seenQuestionText.get(key)
      if (firstSeen) {
        warn('question', 'DUPLICATE_QUESTION', `Same question text as row ${firstSeen}.`)
      } else {
        seenQuestionText.set(key, rowNumber)
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    /* -- final gate: the shared schema -- */
    // Everything above produces friendly, column-anchored messages. This last step
    // runs the SAME schema the commit endpoint runs, so a row can never pass the
    // uploader and then be rejected (or accepted differently) at import time.
    const draft = {
      text,
      type: type as QuestionType,
      points,
      options: present.map((option) => ({
        text: option.text,
        isCorrect: correctLetters.includes(option.letter),
      })),
    }

    const result = questionDraftSchema.safeParse(draft)
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNumber,
          column: issueToColumn(issue.path.map(String)),
          code: 'SCHEMA_REJECTED',
          message: issue.message,
        })
      }
      return
    }

    warningCount += warnings.length
    valid.push({ row: rowNumber, question: result.data, warnings })
  })

  return {
    summary: {
      totalRows: rows.length,
      validRows: valid.length,
      invalidRows: rows.length - valid.length,
      warningCount,
    },
    valid,
    errors,
  }
}

/** Map a Zod path back onto a spreadsheet column so the error lands somewhere useful. */
function issueToColumn(path: string[]): string {
  const [head, index] = path
  if (head === 'text') return 'question'
  if (head === 'type') return 'type'
  if (head === 'points') return 'points'
  if (head === 'options') {
    const position = Number(index)
    if (Number.isInteger(position) && OPTION_LETTERS[position]) return `option${OPTION_LETTERS[position]}`
    return 'correctOption'
  }
  return 'question'
}
