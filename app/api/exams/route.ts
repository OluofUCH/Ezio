import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { requireSchoolScope } from '@/lib/auth/session'
import { pageMeta, paginate } from '@/lib/validation/common'
import { createExamSchema, listExamsSchema } from '@/lib/validation/exam'

export const runtime = 'nodejs'

const EXAM_LIST_SELECT = {
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

/** GET /api/exams — exams in the caller's school. */
export const GET = route(async (req) => {
  const { db } = await requireSchoolScope(req)
  const query = readQuery(req, listExamsSchema)

  const where = {
    ...(query.classLevel ? { classLevel: query.classLevel } : {}),
    ...(query.subject ? { subject: { contains: query.subject, mode: 'insensitive' as const } } : {}),
    ...(query.isPublished === undefined ? {} : { isPublished: query.isPublished }),
    ...(query.search ? { title: { contains: query.search, mode: 'insensitive' as const } } : {}),
  }

  const [exams, total] = await Promise.all([
    db.exam.findMany({ where, ...paginate(query), orderBy: { createdAt: 'desc' }, select: EXAM_LIST_SELECT }),
    db.exam.count({ where }),
  ])

  return ok({ exams, meta: pageMeta(total, query) })
})

/**
 * POST /api/exams — create an exam.
 *
 * Both teachers and school admins may create exams (PRD §2: a teacher "creates/manages
 * exams and questions for their school"). `classLevel` is required and enum-checked
 * by `createExamSchema`; it is the field the entire class-targeting rule depends on.
 *
 * The exam starts unpublished. Publishing runs its own guard checks and has a
 * separate endpoint.
 */
export const POST = route(async (req) => {
  const { db, session } = await requireSchoolScope(req)
  const input = await readJson(req, createExamSchema)

  const exam = await db.exam.create({
    data: {
      title: input.title,
      subject: input.subject,
      classLevel: input.classLevel,
      durationMins: input.durationMins,
      mode: input.mode,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
      maxAttempts: input.maxAttempts,
      startWindow: input.startWindow ?? null,
      endWindow: input.endWindow ?? null,
      // Authorship comes from the session, never the body — otherwise a teacher
      // could attribute an exam to a colleague. schoolId is injected by the
      // tenant extension.
      createdById: session.userId,
    } as never,
    select: EXAM_LIST_SELECT,
  })

  return created({
    exam,
    nextSteps: {
      addQuestions: `/api/exams/${exam.id}/questions`,
      bulkUpload: `/api/exams/${exam.id}/questions/upload`,
      publish: `/api/exams/${exam.id}/publish`,
    },
  })
})
