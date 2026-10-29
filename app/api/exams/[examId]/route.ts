import { ok, readJson, route } from '@/lib/api'
import { conflict } from '@/lib/errors'
import { requireSchoolScope } from '@/lib/auth/session'
import { assertAffected, resolveExamWithCounts } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { updateExamSchema } from '@/lib/validation/exam'
import { updateLegacyExam } from '@/src/modules/school-setup/legacy-exams'

export const runtime = 'nodejs'

type Params = { examId: string }

const EXAM_SELECT = {
  id: true,
  title: true,
  subject: true,
  classLevel: true,
  durationMins: true,
  mode: true,
  maxAttempts: true,
  shuffleQuestions: true,
  shuffleOptions: true,
  startWindow: true,
  endWindow: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { questions: true, examSessions: true } },
} as const

/** GET /api/exams/[examId] */
export const GET = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  const exam = await db.exam.findFirst({ where: { id: examId }, select: EXAM_SELECT })
  if (!exam) throw conflict('Exam not found.', 'CONFLICT')

  const totalPoints = await db.question.aggregate({
    where: { examId },
    _sum: { points: true },
  })

  return ok({
    exam,
    // What a student would score out of, so the teacher can sanity-check the paper
    // before publishing.
    totalPoints: totalPoints._sum.points ?? 0,
    canPublish: exam._count.questions > 0,
  })
})

/**
 * PATCH /api/exams/[examId]
 *
 * Any teacher in the school may edit any of the school's exams, matching PRD §2's
 * "for their school" rather than restricting to the author. To narrow it to the
 * author, add `createdById: session.userId` to the resolver's where clause.
 *
 * Two fields are frozen once students have sat the exam. `durationMins` feeds the
 * server-side deadline (`startedAt + durationMins`), so shortening it retroactively
 * would move the goalposts on sessions already graded. `classLevel` gates who may
 * take it at all, so changing it would leave existing sessions belonging to students
 * who no longer qualify.
 */
export const PATCH = route<Params>(async (req, ctx) => {
  const context = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')
  const input = await readJson(req, updateExamSchema)

  const updated = await updateLegacyExam(context, examId, input, EXAM_SELECT)
  return ok({ exam: updated })
})

/**
 * DELETE /api/exams/[examId]
 *
 * Refused once any session exists. `Exam` cascades to `Question`, `Option` and
 * `ExamSession` (and thence `Answer`), so deleting an exam students have sat would
 * erase their results with no trace — un-publish it instead.
 */
export const DELETE = route<Params>(async (req, ctx) => {
  const { db } = await requireSchoolScope(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  const exam = await resolveExamWithCounts(db, examId)

  if (exam._count.examSessions > 0) {
    throw conflict(
      `This exam has ${exam._count.examSessions} student session(s) and cannot be deleted — doing so would cascade-delete their answers and results. Un-publish it instead (POST /api/exams/${examId}/publish with isPublished: false).`,
      'EXAM_HAS_SESSIONS',
    )
  }

  const result = await db.exam.deleteMany({ where: { id: examId } })
  assertAffected(result, 'Exam not found.')

  return ok({ deleted: true, examId, questionsDeleted: exam._count.questions })
})
