import { ok, readJson, route } from '@/lib/api'
import { conflict } from '@/lib/errors'
import { requireSchoolScope } from '@/lib/auth/session'
import { assertAffected, resolveExamWithCounts } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { publishExamSchema } from '@/lib/validation/exam'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * POST /api/exams/[examId]/publish — the visibility switch (PRD §3.2 step 4).
 *
 * Separate from PATCH because publishing is the moment an exam becomes reachable by
 * students, and that transition has preconditions worth checking in one place rather
 * than scattering them through a general-purpose update.
 *
 * `isPublished: false` un-publishes, which is how a teacher pulls back a mistake.
 * That stays permitted even after students have sat the exam — it hides the exam
 * from anyone who has not started, while existing sessions and their scores are
 * untouched.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')
  const { isPublished } = await readJson(req, publishExamSchema)

  const exam = await resolveExamWithCounts(db, examId)

  if (isPublished) {
    // A published exam with no questions would let a student start a session, see an
    // empty paper, and score 0/0.
    if (exam._count.questions === 0) {
      throw conflict(
        'This exam has no questions yet. Add questions before publishing — a student starting it would be shown an empty paper.',
        'EXAM_HAS_NO_QUESTIONS',
      )
    }

    // Re-checked here as well as in the schema: the window may have been set on an
    // earlier request and the two fields edited independently since.
    if (exam.startWindow && exam.endWindow && exam.startWindow >= exam.endWindow) {
      throw conflict('The availability window is invalid: startWindow must be earlier than endWindow.')
    }

    // A window already in the past publishes an exam nobody can ever take. Worth
    // stopping, since the likely cause is a mistyped year.
    if (exam.endWindow && exam.endWindow < new Date()) {
      throw conflict(
        `This exam's window closed on ${exam.endWindow.toISOString()}, so publishing it now would make it visible to nobody. Update endWindow first.`,
        'EXAM_WINDOW_CLOSED',
      )
    }
  }

  if (exam.isPublished === isPublished) {
    // Idempotent rather than an error — a double-click on Publish should not fail.
    return ok({
      exam: { id: exam.id, title: exam.title, isPublished: exam.isPublished },
      changed: false,
    })
  }

  const result = await db.exam.updateMany({ where: { id: examId }, data: { isPublished } })
  assertAffected(result, 'Exam not found.')

  return ok({
    exam: {
      id: exam.id,
      title: exam.title,
      classLevel: exam.classLevel,
      isPublished,
      questionCount: exam._count.questions,
    },
    changed: true,
    // Restates who can now see it, since class targeting is the rule most likely to
    // surprise ("why can't my SS1 students see this?").
    visibleTo: isPublished
      ? `${exam.classLevel} students at this school, within the availability window`
      : 'nobody — the exam is hidden from students',
  })
})
