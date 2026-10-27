import { ok, readJson, route } from '@/lib/api'
import { conflict } from '@/lib/errors'
import { requireSchoolScope } from '@/lib/auth/session'
import { resolveEditableExam } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { importQuestionsSchema } from '@/lib/validation/question'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * POST /api/exams/[examId]/questions/import — commit reviewed rows (PRD §4.2a step 5).
 *
 * THE ROWS ARRIVING HERE ARE UNTRUSTED. They were produced by `/upload`, but they
 * travelled out to the client for preview and back in again — at which point they
 * are ordinary request input. `readJson` runs them through `importQuestionsSchema`,
 * which is built from the same `questionDraftSchema` the parser applies per row.
 *
 * Without that, every rule the uploader enforces (a real correct option, at least two
 * options, one answer for SINGLE_CHOICE) would be bypassable by POSTing here
 * directly and skipping `/upload` altogether.
 *
 * All-or-nothing: one transaction, so a failure part-way through leaves the exam
 * exactly as it was.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  // Re-validation happens here.
  const { mode, rows } = await readJson(req, importQuestionsSchema)

  const exam = await resolveEditableExam(db, examId)

  const existingCount = await db.question.count({ where: { examId } })

  if (mode === 'REPLACE' && existingCount === 0) {
    // Not an error worth failing on, but worth not pretending a replace happened.
    // Falls through as an append of the same rows.
  }

  const result = await db.$transaction(async (tx) => {
    let deleted = 0

    if (mode === 'REPLACE') {
      // Safe only because `resolveEditableExam` guarantees no sessions exist — no
      // Answer can reference the options about to be cascade-deleted.
      const removal = await tx.question.deleteMany({ where: { examId } })
      deleted = removal.count
    }

    // On APPEND, continue from the current maximum rather than from a count, so a
    // previously deleted question cannot cause a duplicate index.
    const highest =
      mode === 'REPLACE'
        ? { _max: { orderIndex: null } }
        : await tx.question.aggregate({ where: { examId }, _max: { orderIndex: true } })

    const baseIndex = (highest._max.orderIndex ?? -1) + 1

    /**
     * `createManyAndReturn` gives back the generated ids in one round trip, so the
     * whole import is two statements instead of one per question.
     *
     * The returned rows are mapped by `orderIndex` rather than by array position —
     * unique within this batch by construction, so the mapping is correct without
     * depending on the driver returning rows in insertion order.
     */
    const createdQuestions = await tx.question.createManyAndReturn({
      data: rows.map((row, index) => ({
        examId,
        text: row.text,
        type: row.type,
        points: row.points,
        // orderIndex assigned by row order, per PRD §4.2a step 5.
        orderIndex: baseIndex + index,
      })),
      select: { id: true, orderIndex: true },
    })

    const idByOrderIndex = new Map(createdQuestions.map((question) => [question.orderIndex, question.id]))

    const optionData = rows.flatMap((row, index) => {
      const questionId = idByOrderIndex.get(baseIndex + index)
      if (!questionId) {
        // Would mean the database returned fewer rows than were inserted. Throwing
        // rolls the transaction back rather than committing questions with no options.
        throw conflict('Import failed while linking options to questions. Nothing was saved.')
      }
      return row.options.map((option, optionIndex) => ({
        questionId,
        text: option.text,
        isCorrect: option.isCorrect,
        orderIndex: optionIndex,
      }))
    })

    await tx.option.createMany({ data: optionData })

    return { deleted, created: createdQuestions.length, optionsCreated: optionData.length }
  })

  const totalPoints = await db.question.aggregate({ where: { examId }, _sum: { points: true } })
  const finalCount = await db.question.count({ where: { examId } })

  return ok({
    exam: { id: exam.id, title: exam.title, classLevel: exam.classLevel, isPublished: exam.isPublished },
    mode,
    imported: result.created,
    optionsCreated: result.optionsCreated,
    replacedQuestions: result.deleted,
    totalQuestions: finalCount,
    totalPoints: totalPoints._sum.points ?? 0,
    committed: true,
    nextStep: exam.isPublished
      ? 'The exam is already published — these questions are live now.'
      : `Publish when ready: POST /api/exams/${examId}/publish`,
  })
})
