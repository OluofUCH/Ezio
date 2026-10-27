import * as XLSX from 'xlsx'
import { TEMPLATE_HEADERS } from '@/lib/import/questions-xlsx'
import { ROSTER_HEADERS } from '@/lib/import/students-csv'

/**
 * DOWNLOADABLE TEMPLATES (PRD §4.2a — "Teacher downloads a fixed template")
 * =========================================================================
 *
 * Generated in memory from the same header constants the parsers validate against,
 * rather than shipped as committed binaries. Two reasons: a template and a parser
 * kept in separate places drift the moment a column is added, and a checked-in
 * .xlsx is invisible to code review and to diffs.
 */

/** Sample rows demonstrating all three question types and both correctOption forms. */
const QUESTION_EXAMPLES = [
  {
    question: 'What is the capital of Nigeria?',
    type: 'SINGLE_CHOICE',
    optionA: 'Lagos',
    optionB: 'Abuja',
    optionC: 'Kano',
    optionD: 'Ibadan',
    correctOption: 'B',
    points: 1,
  },
  {
    question: 'Which of these are prime numbers?',
    type: 'MULTIPLE_CHOICE',
    optionA: '2',
    optionB: '4',
    optionC: '7',
    optionD: '9',
    // Comma-separated letters — the multi-answer form from PRD §4.2a.
    correctOption: 'A,C',
    points: 2,
  },
  {
    question: 'Water boils at 100 degrees Celsius at sea level.',
    type: 'TRUE_FALSE',
    optionA: 'True',
    optionB: 'False',
    // C and D left blank on purpose: TRUE_FALSE takes only two options.
    optionC: '',
    optionD: '',
    correctOption: 'A',
    // Blank points is legal and defaults to 1 — shown here rather than described.
    points: '',
  },
] as const

export function buildQuestionTemplate(): Buffer {
  const sheet = XLSX.utils.json_to_sheet(QUESTION_EXAMPLES as unknown as Record<string, unknown>[], {
    header: [...TEMPLATE_HEADERS],
  })

  // Column widths, so a teacher opening the file can actually read the question
  // column instead of a 9-character sliver.
  sheet['!cols'] = [
    { wch: 58 }, // question
    { wch: 18 }, // type
    { wch: 22 }, // optionA
    { wch: 22 }, // optionB
    { wch: 22 }, // optionC
    { wch: 22 }, // optionD
    { wch: 15 }, // correctOption
    { wch: 8 }, // points
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Questions')

  // A second sheet holding the instructions. The parser reads only the first sheet,
  // so guidance here can never be mistaken for data.
  const guide = XLSX.utils.aoa_to_sheet([
    ['CBT QUESTION UPLOAD TEMPLATE'],
    [],
    ['Fill in the "Questions" sheet. Delete the three example rows before uploading.'],
    [],
    ['Column', 'Required', 'Notes'],
    ['question', 'Yes', 'The question text. Up to 2000 characters.'],
    ['type', 'Yes', 'SINGLE_CHOICE, MULTIPLE_CHOICE or TRUE_FALSE.'],
    ['optionA', 'Yes', 'First option.'],
    ['optionB', 'Yes', 'Second option. At least two options are required.'],
    ['optionC', 'No', 'Leave blank if unused.'],
    ['optionD', 'No', 'Leave blank if unused.'],
    ['correctOption', 'Yes', 'Letter of the correct option, e.g. B. For MULTIPLE_CHOICE use commas: A,C'],
    ['points', 'No', 'Whole number 1-100. Blank means 1.'],
    [],
    ['Rules enforced on upload:'],
    ['- Every row is checked before anything is saved. A file with errors imports nothing.'],
    ['- correctOption must point at an option that actually has text.'],
    ['- SINGLE_CHOICE and TRUE_FALSE accept exactly one correct letter.'],
    ['- TRUE_FALSE uses only optionA and optionB.'],
    ['- Images are not supported in this version. Text only.'],
  ])
  guide['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 76 }]
  XLSX.utils.book_append_sheet(workbook, guide, 'Instructions')

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export function buildRosterTemplate(): string {
  const rows = [
    [...ROSTER_HEADERS].join(','),
    'STU001,Adebayo Chinedu Okonkwo,JSS2,',
    'STU002,Fatima Aisha Bello,JSS2,481920',
    'STU003,Emeka Daniel Nwosu,SS1,',
  ]

  // Leading BOM so Excel on Windows opens this as UTF-8 rather than mangling
  // accented names in the roster.
  return `﻿${rows.join('\r\n')}\r\n`
}
