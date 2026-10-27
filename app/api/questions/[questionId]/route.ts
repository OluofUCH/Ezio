import { ok, readJson, route } from '@/lib/api'
import { requireSchoolScope } from '@/lib/auth/session'
import { assertAffected, resolveEditableExam, resolveQuestion } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { updateQuestionSchema } from '@/lib/validation/question'

export const runtime = 'nodejs'

type Params = { questionId: string }

/**
 * PATCH /api/questions/[questionId]
 *
 * Replaces the option set wholesale rather than patching options individually.
 * `isCorrect` lives on the option, so an incremental update passes through states
 * where a question has zero or two correct answers; replacing the set atomically
 * means every committed state is valid.
 *
 * The consequence is that option ids change on every edit. That is fine because an
 * exam with any session is frozen (`resolveEditableExam`), so no `Answer` can be
 * pointing at an option this touches.
 */
export const PATCH = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const questionId = parseParam((await ctx.params).questionId, 'questionId')
  const input = await readJson(req, updateQuestionSchema)

  // Two-step on purpose: resolve the question to learn its exam (and confirm the
  // question is in this tenant), then run the editability guard on that exam.
  const question = await resolveQuestion(db, questionId)
  await resolveEditableExam(db, question.examId)

  const updated = await db.$transaction(async (tx) => {
    await tx.option.deleteMany({ where: { questionId } })

    await tx.question.updateMany({
      where: { id: questionId },
      data: { text: input.text, type: input.type, points: input.points },
    })

    await tx.option.createMany({
      data: input.options.map((option, index) => ({
        questionId,
        text: option.text,
        isCorrect: option.isCorrect,
        orderIndex: index,
      })),
    })

    return tx.question.findFirstOrThrow({
      where: { id: questionId },
      select: {
        id: true,
        text: true,
        type: true,
        points: true,
        orderIndex: true,
        options: {
          select: { id: true, text: true, isCorrect: true, orderIndex: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    })
  })

  return ok({ question: updated })
})

/**
 * DELETE /api/questions/[questionId]
 *
 * `orderIndex` values are left with a gap rather than resequenced. Order is only
 * ever used as a relative sort key (and is bypassed entirely when shuffling is on),
 * so a gap is invisible — while rewriting every subsequent row on each delete would
 * be a wasted write and a chance to corrupt the sequence.
 */
export const DELETE = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const questionId = parseParam((await ctx.params).questionId, 'questionId')

  const question = await resolveQuestion(db, questionId)
  const exam = await resolveEditableExam(db, question.examId)

  // Options cascade via the Question relation; answers cannot exist because the
  // exam is guaranteed session-free by the guard above.
  const result = await db.question.deleteMany({ where: { id: questionId } })
  assertAffected(result, 'Question not found.')

  const remaining = await db.question.count({ where: { examId: question.examId } })

  return ok({
    deleted: true,
    questionId,
    remainingQuestions: remaining,
    // A published exam whose last question was just removed is now unusable, and the
    // teacher should know before a student hits it.
    warning:
      remaining === 0 && exam.isPublished
        ? 'This exam is published but now has no questions. Add questions or un-publish it.'
        : undefined,
  })
})
