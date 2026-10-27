import type { GradableAnswer, QuestionType } from '@/lib/core/grading-rules'
import { selectionColumns } from '@/lib/core/grading-rules'

/**
 * THE SQLITE STORAGE BOUNDARY
 * ===========================
 *
 * The cloud stores `Answer.selectedOptionIds` in a native `Json` column; SQLite has none,
 * so here it is JSON encoded into TEXT. Every conversion between the two representations
 * happens in this file and nowhere else.
 *
 * That matters because `gradeAnswer` decides between the two storage columns by calling
 * `Array.isArray()` on this value (../lib/core/grading-rules.ts). Hand it the raw TEXT
 * from SQLite and the check silently fails: a correct multiple-choice answer grades as
 * wrong, with no error anywhere. Funnelling it through `toGradable` below is what stops
 * that from ever being one forgotten `JSON.parse` away.
 */

/**
 * Read a stored selection back into a plain array of option ids.
 *
 * Tolerates both columns and a malformed value, because this data was written by an
 * earlier version of this same app on a machine nobody is monitoring — throwing here
 * would fail a student's whole paper over one bad row.
 */
export function parseSelectedOptionIds(
  selectedOptionIds: string | null,
  selectedOptionId: string | null,
): string[] {
  if (selectedOptionIds) {
    try {
      const parsed: unknown = JSON.parse(selectedOptionIds)
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string')
      }
    } catch {
      // Fall through to the single-option column.
    }
  }
  return selectedOptionId ? [selectedOptionId] : []
}

/**
 * Split a selection into the columns to write, mirroring the cloud exactly.
 *
 * The which-column-for-which-type decision comes from the shared `selectionColumns`, so
 * online and offline cannot disagree about it; only the JSON-vs-TEXT encoding is local.
 */
export function toStorageColumns(
  type: QuestionType,
  selectedOptionIds: string[],
): { selectedOptionId: string | null; selectedOptionIds: string | null } {
  const columns = selectionColumns(type, selectedOptionIds)
  return {
    selectedOptionId: columns.selectedOptionId,
    selectedOptionIds: columns.selectedOptionIdsArray ? JSON.stringify(columns.selectedOptionIdsArray) : null,
  }
}

/**
 * Project a stored answer row into the shape `gradeAnswer` expects.
 *
 * The single place SQLite's TEXT becomes a real array before grading. Always use this
 * rather than passing a row straight through.
 */
export function toGradable(row: {
  id: string
  questionId: string
  selectedOptionId: string | null
  selectedOptionIds: string | null
}): GradableAnswer {
  return {
    id: row.id,
    questionId: row.questionId,
    selectedOptionId: row.selectedOptionId,
    selectedOptionIds: parseSelectedOptionIds(row.selectedOptionIds, row.selectedOptionId),
  }
}
