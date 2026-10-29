import * as XLSX from 'xlsx'
import type { ClassLevel } from '@prisma/client'
import { generatePin } from '@/lib/auth/pin'
import { normaliseRegNumber } from '@/lib/auth/student-credentials'
import { ACCEPTED_CLASS_LEVEL_SPELLINGS, normaliseClassLevel } from '@/lib/validation/student'
import { WorkbookFormatError, type RowIssue } from '@/lib/import/questions-xlsx'

/**
 * ROSTER CSV IMPORT (PRD §3.1 step 3, §4.5)
 * =========================================
 *
 * Pure like the question parser: no Prisma, no request context. Collision checks
 * against existing roster rows need the database and therefore live in the route;
 * everything decidable from the file alone is decided here.
 *
 * Parsed with SheetJS rather than a separate CSV library — it already handles
 * quoted fields, embedded commas and BOM-prefixed exports from Excel, which is
 * where these files come from. One dependency instead of two.
 */

export type ParsedStudentRow = {
  row: number
  regNumber: string
  fullName: string
  classLevel: ClassLevel
  pin: string
  arm?: string
  /** True when the PIN was generated rather than supplied in the file. */
  pinGenerated: boolean
  warnings: RowIssue[]
}

export type StudentParseReport = {
  summary: { totalRows: number; validRows: number; invalidRows: number; warningCount: number }
  valid: ParsedStudentRow[]
  errors: RowIssue[]
}

export const ROSTER_HEADERS = ['regNumber', 'fullName', 'classLevel', 'pin', 'arm'] as const
const REQUIRED_HEADERS = ['regNumber', 'fullName', 'classLevel'] as const

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]/g, '')
}

export function parseRosterFile(buffer: Buffer, opts: { maxRows?: number } = {}): StudentParseReport {
  const maxRows = opts.maxRows ?? 500

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellFormula: false, cellHTML: false, cellDates: false })
  } catch (err) {
    throw new WorkbookFormatError(
      `The file could not be read. ${err instanceof Error ? err.message : ''}`.trim(),
    )
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new WorkbookFormatError('The file contains no data.')
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new WorkbookFormatError('The file could not be read.')

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  })

  if (rows.length === 0) {
    throw new WorkbookFormatError('The file has a header row but no student rows.')
  }
  if (rows.length > maxRows) {
    throw new WorkbookFormatError(
      `The file contains ${rows.length} rows; the limit is ${maxRows} per import. Split it into smaller files.`,
    )
  }

  const headerMap = new Map<string, string>()
  for (const key of Object.keys(rows[0] as Record<string, unknown>)) {
    headerMap.set(normaliseHeader(key), key)
  }

  const missing = REQUIRED_HEADERS.filter((header) => !headerMap.has(normaliseHeader(header)))
  if (missing.length > 0) {
    throw new WorkbookFormatError(
      `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected header row: ${ROSTER_HEADERS.join(', ')} (pin is optional).`,
    )
  }

  const cell = (row: Record<string, unknown>, header: string): string => {
    const key = headerMap.get(normaliseHeader(header))
    if (!key) return ''
    const value = row[key]
    return value === null || value === undefined ? '' : String(value).trim()
  }

  const valid: ParsedStudentRow[] = []
  const errors: RowIssue[] = []
  let warningCount = 0

  // Reg numbers already claimed *within this file*. A duplicate here would violate
  // @@unique([schoolId, regNumber]) mid-transaction and roll the whole import back
  // with an opaque Prisma error, so it is caught as a row-level error instead.
  const seenRegNumbers = new Map<string, number>()

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const rowErrors: RowIssue[] = []
    const warnings: RowIssue[] = []

    const err = (column: string, code: string, message: string) =>
      rowErrors.push({ row: rowNumber, column, code, message })

    /* -- regNumber -- */
    const rawReg = cell(row, 'regNumber')
    let regNumber = ''
    if (!rawReg) {
      err('regNumber', 'REG_NUMBER_REQUIRED', 'Registration number is required.')
    } else if (rawReg.length > 60) {
      err('regNumber', 'REG_NUMBER_TOO_LONG', `Registration number is ${rawReg.length} characters; the limit is 60.`)
    } else {
      regNumber = normaliseRegNumber(rawReg)
      const firstSeen = seenRegNumbers.get(regNumber)
      if (firstSeen) {
        err(
          'regNumber',
          'DUPLICATE_IN_FILE',
          `Registration number "${regNumber}" already appears on row ${firstSeen}.`,
        )
      } else {
        seenRegNumbers.set(regNumber, rowNumber)
      }
    }

    /* -- fullName -- */
    const rawName = cell(row, 'fullName').replace(/\s+/g, ' ')
    if (rawName.length < 2) {
      err('fullName', 'FULL_NAME_REQUIRED', 'Full name is required.')
    } else if (rawName.length > 120) {
      err('fullName', 'FULL_NAME_TOO_LONG', `Name is ${rawName.length} characters; the limit is 120.`)
    }

    /* -- classLevel -- */
    const rawClass = cell(row, 'classLevel')
    let classLevel: ClassLevel | null = null
    if (!rawClass) {
      err('classLevel', 'CLASS_LEVEL_REQUIRED', 'Class level is required.')
    } else {
      const normalised = normaliseClassLevel(rawClass)
      if (!normalised) {
        err(
          'classLevel',
          'CLASS_LEVEL_INVALID',
          `"${rawClass}" is not a recognised class. Accepted: ${ACCEPTED_CLASS_LEVEL_SPELLINGS.join(', ')}.`,
        )
      } else {
        classLevel = normalised as ClassLevel
      }
    }

    /* -- pin (optional) -- */
    const rawPin = cell(row, 'pin')
    const arm = cell(row, 'arm')
    if (arm.length > 120) err('arm', 'ARM_TOO_LONG', 'Arm name must be at most 120 characters.')
    let pin = ''
    let pinGenerated = false
    if (!rawPin) {
      pin = generatePin()
      pinGenerated = true
    } else if (!/^\d{4,8}$/.test(rawPin)) {
      err('pin', 'PIN_INVALID', `"${rawPin}" is not valid — a PIN must be 4 to 8 digits. Leave blank to auto-generate.`)
    } else {
      pin = rawPin
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    warningCount += warnings.length
    valid.push({
      row: rowNumber,
      regNumber,
      fullName: rawName,
      classLevel: classLevel as ClassLevel,
      pin,
      arm: arm || undefined,
      pinGenerated,
      warnings,
    })
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
