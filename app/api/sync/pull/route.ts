import { ok, readQuery, route } from '@/lib/api'
import { conflict, notFound } from '@/lib/errors'
import { requireDevice } from '@/lib/auth/device'
import {
  SYNC_EXAM_SELECT,
  SYNC_QUESTION_SELECT,
  SYNC_STUDENT_SELECT,
  type SyncPullPayload,
} from '@/lib/sync/payload'
import { pullSyncSchema } from '@/lib/validation/local-server'
import { recordRosterGrant } from '@/src/modules/cbt-results/eligibility'

export const runtime = 'nodejs'

/**
 * GET /api/sync/pull?examId= — stage an exam onto a hall server.
 *
 * PRD §3.4 step 1: done in advance, while the school still has internet. The device
 * comes away holding everything it needs to run the paper and grade it with no
 * connectivity at all — questions, the answer key, and the class roster with PINs.
 *
 * See `lib/sync/payload.ts` for what that means for the sensitivity of this response.
 * It is the one route in the codebase that deliberately serves both `Option.isCorrect`
 * and `Student.pin`, and it is gated on a provisioned device key rather than any human
 * session.
 *
 * Read-only and idempotent — a device can re-pull to pick up a corrected paper right up
 * until the exam starts.
 */
export const GET = route(async (req) => {
  const { db, session } = await requireDevice(req)
  const { examId } = readQuery(req, pullSyncSchema)

  /**
   * The tenant client is scoped to the device's own school, so an examId belonging to
   * another school is a 404 here. A leaked device key therefore cannot be used to
   * harvest another tenant's papers — the same structural guarantee staff and students
   * get, from the same mechanism.
   */
  const exam = await db.exam.findFirst({
    where: { id: examId },
    select: SYNC_EXAM_SELECT,
  })
  if (!exam) throw notFound('Exam not found.')

  /**
   * An unpublished exam is still being written. Staging a draft would put a paper on a
   * hall machine that the teacher may still be editing, and the device has no way to
   * learn about later edits once it is offline.
   */
  if (!exam.isPublished) {
    throw conflict(
      `"${exam.title}" is not published yet, so it cannot be staged for offline use. Publish it first.`,
      'EXAM_NOT_PUBLISHED',
    )
  }

  /**
   * `mode` is a deliberate refusal, not a formality. An exam marked ONLINE was set up to
   * be sat against the cloud — copying its answer key onto a hall server would widen its
   * exposure for no reason the teacher asked for. OFFLINE_LAN and HYBRID are the modes
   * that opted in.
   */
  if (exam.mode === 'ONLINE') {
    throw conflict(
      `"${exam.title}" is set to ONLINE mode, so it is not available for offline sync. Change its mode to OFFLINE_LAN or HYBRID first.`,
      'CONFLICT',
    )
  }

  const [questions, students, totalPoints, school] = await Promise.all([
    db.question.findMany({
      where: { examId },
      select: SYNC_QUESTION_SELECT,
      // Ordered so the device stores a stable baseline. Per-student shuffling is
      // recomputed on the device from the same seed as the cloud (lib/shuffle.ts), so
      // this order is the fallback, not what a student sees.
      orderBy: { orderIndex: 'asc' },
    }),
    /**
     * The roster, narrowed to the exam's own class level — PRD §3.4 step 1: "syncing a
     * JSS2 exam only requires JSS2 students' data". This is the filter that keeps a
     * hall server from holding every PIN in the school.
     */
    db.student.findMany({
      where: { classLevel: exam.classLevel, NOT: { enrollments: { some: { isCurrent: true, status: 'WITHDRAWN' } } } },
      select: SYNC_STUDENT_SELECT,
      orderBy: { regNumber: 'asc' },
    }),
    db.question.aggregate({ where: { examId }, _sum: { points: true } }),
    db.school.findFirst({ select: { id: true, name: true, slug: true } }),
  ])

  // Refused rather than shipped empty: a hall server that boots with a paper of zero
  // questions fails at the worst possible moment, in front of a room of students.
  if (questions.length === 0) {
    throw conflict(
      `"${exam.title}" has no questions, so there is nothing to stage.`,
      'EXAM_HAS_NO_QUESTIONS',
    )
  }

  if (students.length === 0) {
    throw conflict(
      `No ${exam.classLevel} students are on the roster, so nobody could log in to this exam offline. Import the class first.`,
      'CONFLICT',
    )
  }

  // Scoped by the tenant extension to the device's school, so this cannot be null in
  // practice; the guard exists because the type says it can.
  if (!school) throw notFound('School not found.')
  await recordRosterGrant(db, school.id, session.localServerId, exam.id, exam.classLevel, students.map((student) => student.id))

  const payload: SyncPullPayload = {
    localServer: { id: session.localServerId, name: session.name },
    school,
    exam: {
      ...exam,
      // ISO strings over the wire — the device parses them back. See SyncPullPayload.
      startWindow: exam.startWindow ? exam.startWindow.toISOString() : null,
      endWindow: exam.endWindow ? exam.endWindow.toISOString() : null,
    },
    questions,
    students,
    meta: {
      generatedAt: new Date().toISOString(),
      questionCount: questions.length,
      studentCount: students.length,
      totalPoints: totalPoints._sum.points ?? 0,
    },
  }

  return ok(payload)
})
