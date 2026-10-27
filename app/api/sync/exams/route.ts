import { ok, route } from '@/lib/api'
import { requireDevice } from '@/lib/auth/device'

export const runtime = 'nodejs'

/**
 * GET /api/sync/exams - exams this paired hall is allowed to stage.
 *
 * Metadata only. The answer key and roster are still fetched by `/api/sync/pull`
 * for the one exam the invigilator chooses, so this endpoint cannot be used to
 * enumerate a whole school's papers.
 */
export const GET = route(async (req) => {
  const { db } = await requireDevice(req)

  const exams = await db.exam.findMany({
    where: {
      isPublished: true,
      mode: { in: ['OFFLINE_LAN', 'HYBRID'] },
    },
    select: {
      id: true,
      title: true,
      subject: true,
      classLevel: true,
      durationMins: true,
      mode: true,
      startWindow: true,
      endWindow: true,
      _count: { select: { questions: true } },
    },
    orderBy: [{ startWindow: 'asc' }, { title: 'asc' }],
  })

  const withRosterCounts = await Promise.all(
    exams.map(async (exam) => ({
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      classLevel: exam.classLevel,
      durationMins: exam.durationMins,
      mode: exam.mode,
      startWindow: exam.startWindow?.toISOString() ?? null,
      endWindow: exam.endWindow?.toISOString() ?? null,
      questionCount: exam._count.questions,
      studentCount: await db.student.count({ where: { classLevel: exam.classLevel } }),
    })),
  )

  return ok({ exams: withRosterCounts })
})
