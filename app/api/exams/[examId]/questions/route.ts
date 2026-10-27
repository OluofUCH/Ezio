import { created, ok, readJson, route } from '@/lib/api'
import { requireSchoolScope } from '@/lib/auth/session'
import { resolveEditableExam, resolveExam } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { createQuestionSchema } from '@/lib/validation/question'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * GET /api/exams/[examId]/questions — the authoring view.
 *
 * Includes `isCorrect`, which is correct here and only here: this is staff-only
 * (`requireSchoolScope`). The student-facing paper is built from
 * `STUDENT_PAPER_SELECT` in lib/grading.ts, whose types have no field for it.
 */
export const GET = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  // Proves the exam is in this tenant before anything is read from it.
  const exam = await resolveExam(db, examId)

  const questions = await db.question.findMany({
    where: { examId },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      text: true,
      type: true,
      points: true,
      orderIndex: true,
      createdAt: true,
      options: {
        select: { id: true, text: true, isCorrect: true, orderIndex: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  return ok({
    exam: { id: exam.id, title: exam.title, classLevel: exam.classLevel, isPublished: exam.isPublished },
    questions,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
  })
})

/**
 * POST /api/exams/[examId]/questions — manual single-question entry (PRD §4.2a).
 *
 * The secondary path, for touch-ups after a bulk import or a short exam built from
 * scratch. Validated by `questionDraftSchema` — the same schema the .xlsx parser and
 * the confirm-import endpoint use, so a question created by hand is subject to
 * identical rules to one that arrived in a spreadsheet.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')
  const input = await readJson(req, createQuestionSchema)

  await resolveEditableExam(db, examId)

  // Appended to the end of the paper. `_max` rather than a count so a prior delete
  // cannot cause a duplicate orderIndex.
  const highest = await db.question.aggregate({ where: { examId }, _max: { orderIndex: true } })
  const orderIndex = (highest._max.orderIndex ?? -1) + 1

  const question = await db.question.create({
    data: {
      examId,
      text: input.text,
      type: input.type,
      points: input.points,
      orderIndex,
      // Nested create: the question and its options land in one statement, so a
      // question can never briefly exist with no options.
      options: {
        create: input.options.map((option, index) => ({
          text: option.text,
          isCorrect: option.isCorrect,
          orderIndex: index,
        })),
      },
    },
    select: {
      id: true,
      text: true,
      type: true,
      points: true,
      orderIndex: true,
      options: { select: { id: true, text: true, isCorrect: true, orderIndex: true }, orderBy: { orderIndex: 'asc' } },
    },
  })

  return created({ question })
})
