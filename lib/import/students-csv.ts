import * as XLSX from 'xlsx'
import type { ClassLevel } from '@prisma/client'
import { generatePin } from '@/lib/auth/pin'
import { normaliseRegNumber } from '@/lib/auth/student-credentials'
import { ACCEPTED_CLASS_LEVEL_SPELLINGS, normaliseClassLevel } from '@/lib/validation/student'
import { WorkbookFormatError, type RowIssue } from '@/lib/import/questions-xlsx'
import { STUDENT_PROFILE_HEADERS, studentProfileDetailsSchema, type StudentProfileDetails } from '@/src/modules/students/profile-validation'

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

export type ParsedStudentRow = StudentProfileDetails & {
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

export const ROSTER_HEADERS = ['regNumber', 'fullName', 'classLevel', 'pin', 'arm', ...STUDENT_PROFILE_HEADERS] as const
const REQUIRED_HEADERS = ['regNumber', 'fullName', 'classLevel'] as const

function normaliseHeader(header: string): string {
  const key = header.trim().toLowerCase().replace(/[\s_-]/g, '')
  return key === 'classarm' ? 'arm' : key === 'dob' ? 'dateofbirth' : key
}

export function parseRosterFile(buffer: Buffer, opts: { maxRows?: number } = {}): StudentParseReport {
  const maxRows = opts.maxRows ?? 500

  let workbook: XLSX.WorkBook
  try {
    // CSV values stay text so PINs, registration numbers and guardian phones keep
    // leading zeros. Formatted Excel cells retain their display value below.
    workbook = XLSX.read(buffer, { type: 'buffer', raw: true, cellFormula: false, cellHTML: false, cellDates: false, cellNF: true, dateNF: 'yyyy-mm-dd' })
  } catch (err) {
    throw new WorkbookFormatError(
      `The file could not be read. ${err instanceof Error ? err.message : ''}`.trim(),
    )
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new WorkbookFormatError('The file contains no data.')
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new WorkbookFormatError('The file could not be read.')

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  })
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  const rows = grid.slice(1).map((cells, index) => ({ cells, rowNumber: range.s.r + index + 2 }))
    .filter(({ cells }) => cells.some(value => String(value ?? '').trim()))

  if (rows.length === 0) {
    throw new WorkbookFormatError('The file has a header row but no student rows.')
  }
  if (rows.length > maxRows) {
    throw new WorkbookFormatError(
      `The file contains ${rows.length} rows; the limit is ${maxRows} per import. Split it into smaller files.`,
    )
  }

  const headerMap = new Map<string, number>()
  for (const [column, value] of (grid[0] ?? []).entries()) {
    const key = normaliseHeader(String(value ?? ''))
    if (!key) continue
    if (headerMap.has(key)) throw new WorkbookFormatError(`Duplicate column: ${String(value)}. Keep one column for each field.`)
    headerMap.set(key, column)
  }

  const missing = REQUIRED_HEADERS.filter((header) => !headerMap.has(normaliseHeader(header)))
  if (missing.length > 0) {
    throw new WorkbookFormatError(
      `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected header row: ${ROSTER_HEADERS.join(', ')}. Only regNumber, fullName and classLevel are required by the file format.`,
    )
  }

  const cell = (row: typeof rows[number], header: string): string => {
    const key = headerMap.get(normaliseHeader(header))
    if (key === undefined) return ''
    if (header === 'dateOfBirth') {
      const source = sheet[XLSX.utils.encode_cell({ r: row.rowNumber - 1, c: range.s.c + key })] as XLSX.CellObject | undefined
      if (source?.t === 'n' && source.z && XLSX.SSF.is_date(source.z)) {
        const date = XLSX.SSF.parse_date_code(Number(source.v), { date1904: Boolean(workbook.Workbook?.WBProps?.date1904) })
        if (date) return `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
      }
    }
    const value = row.cells[key]
    return value === null || value === undefined ? '' : String(value).trim()
  }

  const valid: ParsedStudentRow[] = []
  const errors: RowIssue[] = []
  let warningCount = 0

  // Reg numbers already claimed *within this file*. A duplicate here would violate
  // @@unique([schoolId, regNumber]) mid-transaction and roll the whole import back
  // with an opaque Prisma error, so it is caught as a row-level error instead.
  const seenRegNumbers = new Map<string, number>()

  rows.forEach((row) => {
    const { rowNumber } = row
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

    const rawProfile = Object.fromEntries(STUDENT_PROFILE_HEADERS.map(header => [header, cell(row, header)]).filter(([, value]) => value !== ''))
    const profile = studentProfileDetailsSchema.safeParse(rawProfile)
    if (!profile.success) {
      for (const issue of profile.error.issues) err(String(issue.path[0]), 'PROFILE_INVALID', issue.message)
    } else {
      if (profile.data.dateOfBirth && profile.data.dateOfBirth > new Date().toISOString().slice(0, 10)) {
        err('dateOfBirth', 'DATE_OF_BIRTH_FUTURE', 'Date of birth cannot be in the future.')
      }
      const { guardianName, guardianPhone, guardianEmail, guardianRelationship } = profile.data
      if ((guardianName || guardianPhone || guardianEmail || guardianRelationship) && (!guardianName || !guardianPhone)) {
        warnings.push({ row: rowNumber, column: !guardianName ? 'guardianName' : 'guardianPhone', code: 'GUARDIAN_INCOMPLETE', message: 'Both guardian name and phone are needed for automatic parent access. The student can still be imported.' })
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      return
    }

    warningCount += warnings.length
    valid.push({
      ...(profile.success ? profile.data : {}),
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
