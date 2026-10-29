import { created, ok, route } from '@/lib/api'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { requireStudent } from '@/lib/auth/session'
import { STUDENT_PAPER_SELECT, buildStudentPaper, enforceSessionDeadline, type StudentFacingQuestion } from '@/lib/grading'
import { isWithinExamWindow, secondsRemaining, sessionDeadline } from '@/lib/timing'
import { parseParam } from '@/lib/validation/common'
import { schoolTransaction } from '@/src/modules/shared/transaction'
import { assertStudentCanStart } from '@/src/modules/students/management'

export const runtime = 'nodejs'

type Params = { examId: string }

/**
 * POST /api/student/exams/[examId]/start — begin or resume an attempt.
 *
 * The gate every other exam route depends on. Checks, in order:
 *   1. the exam is in this student's school   (tenant client)
 *   2. it is published
 *   3. its classLevel matches the student's   (from the DB, not the token)
 *   4. now is inside the availability window
 *   5. it actually has questions
 *   6. the attempt limit has not been reached
 *
 * Resumes rather than errors when a session is already open — a refreshed tab or a
 * reconnecting device should land back in the exam, not be told it is already taking it.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { session, db } = await requireStudent(req)
  const examId = parseParam((await ctx.params).examId, 'examId')

  // Re-read live: a student deleted or promoted since their token was issued must not
  // be able to start a new attempt on the strength of a stale claim.
  const student = await db.student.findFirst({
    where: { id: session.studentId },
    select: { id: true, classLevel: true, fullName: true, school: { select: { isActive: true } } },
  })
  if (!student) throw notFound('Student record not found.')
  if (!student.school.isActive) throw forbidden('This school is currently inactive. Contact your administrator.')
  await assertStudentCanStart(db, student.id)

  const exam = await db.exam.findFirst({
    where: { id: examId, isPublished: true },
    select: {
      id: true,
      title: true,
      subject: true,
      classLevel: true,
      durationMins: true,
      maxAttempts: true,
      shuffleQuestions: true,
      shuffleOptions: true,
      startWindow: true,
      endWindow: true,
    },
  })
  if (!exam) throw notFound('Exam not found.')

  /** PRD §3.2 — the check that cannot be bypassed by calling the API directly. */
  if (exam.classLevel !== student.classLevel) {
    throw forbidden(
      `This exam is for ${exam.classLevel} students. You are registered as ${student.classLevel}.`,
      'WRONG_CLASS_LEVEL',
    )
  }

  const now = new Date()
  if (!isWithinExamWindow(exam, now)) {
    throw conflict(
      exam.startWindow && now < exam.startWindow
        ? `This exam opens at ${exam.startWindow.toISOString()}.`
        : 'This exam is closed.',
      'EXAM_WINDOW_CLOSED',
    )
  }

  const questionCount = await db.question.count({ where: { examId } })
  if (questionCount === 0) {
    throw conflict('This exam has no questions. Please tell your teacher.', 'EXAM_HAS_NO_QUESTIONS')
  }

  /* ---- resume an open session, or let an expired one close itself ---- */

  const open = await db.examSession.findFirst({
    where: { examId, studentId: student.id, status: 'IN_PROGRESS' },
    select: { id: true, status: true, startedAt: true },
  })

  if (open) {
    // If its deadline has already passed, this auto-submits and grades it — which
    // also frees the student to use a remaining attempt, if they have one.
    const check = await enforceSessionDeadline(db, { ...open, exam }, now)

    if (!check.expired) {
      return ok(await buildResponse(db, open.id, open.startedAt, exam, student.id, now, true))
    }
  }

  /* ---- attempt limit ---- */

  const attemptsUsed = await db.examSession.count({
    where: { examId, studentId: student.id, status: { not: 'IN_PROGRESS' } },
  })

  if (attemptsUsed >= exam.maxAttempts) {
    throw conflict(
      `You have used all ${exam.maxAttempts} permitted attempt${exam.maxAttempts === 1 ? '' : 's'} for this exam.`,
      'ATTEMPT_LIMIT_REACHED',
    )
  }

  /* ---- create ---- */

  let sessionId: string
  let startedAt: Date

  try {
    const createdSession = await schoolTransaction(db, async (tx) => {
      const live = await tx.student.findFirst({ where: { id: student.id }, select: { classLevel: true } })
      const paper = await tx.exam.findFirst({ where: { id: examId, isPublished: true }, select: { classLevel: true, durationMins: true } })
      if (!live || !paper || live.classLevel !== paper.classLevel || paper.classLevel !== exam.classLevel || paper.durationMins !== exam.durationMins) throw conflict('Class placement or exam settings changed. Reload the exam before starting.')
      await assertStudentCanStart(tx, student.id)
      const used = await tx.examSession.count({ where: { examId, studentId: student.id, status: { not: 'IN_PROGRESS' } } })
      if (used >= exam.maxAttempts) throw conflict('The attempt limit has been reached.', 'ATTEMPT_LIMIT_REACHED')
      return tx.examSession.create({ data: { examId, studentId: student.id }, select: { id: true, startedAt: true } })
    })
    sessionId = createdSession.id
    startedAt = createdSession.startedAt
  } catch (err) {
    /**
     * A unique violation here means the partial index added in the init migration
     * fired — `ExamSession_one_active_per_student_exam`, which permits one
     * IN_PROGRESS session per (examId, studentId). That is a concurrent double-start:
     * two clicks, or two tabs, racing past the check above.
     *
     * The index exists because `@@unique([localServerId, localId])` does not cover
     * online sessions (both columns NULL, and Postgres treats NULLs as distinct), so
     * without it both requests would succeed and quietly consume two attempts.
     *
     * The loser resumes the winner's session, which is what the student wanted.
     */
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      const winner = await db.examSession.findFirst({
        where: { examId, studentId: student.id, status: 'IN_PROGRESS' },
        select: { id: true, startedAt: true },
      })
      if (!winner) throw err
      return ok(await buildResponse(db, winner.id, winner.startedAt, exam, student.id, now, true))
    }
    throw err
  }

  return created(await buildResponse(db, sessionId, startedAt, exam, student.id, now, false))
})

type ExamShape = {
  id: string
  title: string
  subject: string
  classLevel: string
  durationMins: number
  shuffleQuestions: boolean
  shuffleOptions: boolean
  endWindow: Date | null
}

/**
 * Assemble the paper plus any answers already saved.
 *
 * The questions are selected with `STUDENT_PAPER_SELECT`, which has no `isCorrect`
 * field — so the answer key cannot reach a student through this response even by
 * accident (lib/grading.ts).
 */
async function buildResponse(
  db: Awaited<ReturnType<typeof requireStudent>>['db'],
  sessionId: string,
  startedAt: Date,
  exam: ExamShape,
  studentId: string,
  now: Date,
  resumed: boolean,
) {
  const [questions, savedAnswers] = await Promise.all([
    db.question.findMany({ where: { examId: exam.id }, select: STUDENT_PAPER_SELECT }),
    db.answer.findMany({
      where: { examSessionId: sessionId },
      select: { questionId: true, selectedOptionId: true, selectedOptionIds: true },
    }),
  ])

  const paper = buildStudentPaper(questions as StudentFacingQuestion[], {
    studentId,
    examId: exam.id,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
  })

  return {
    session: {
      id: sessionId,
      startedAt,
      // The authoritative values. The client counts down from `secondsRemaining` for
      // display, but every write is judged against the server's own clock.
      deadline: sessionDeadline({ startedAt, exam: { durationMins: exam.durationMins, endWindow: exam.endWindow } }),
      secondsRemaining: secondsRemaining(
        { startedAt, exam: { durationMins: exam.durationMins, endWindow: exam.endWindow } },
        now,
      ),
      resumed,
    },
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      classLevel: exam.classLevel,
      durationMins: exam.durationMins,
    },
    questions: paper,
    // Populated on resume so a reconnecting client can restore the student's choices.
    savedAnswers: savedAnswers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionIds: Array.isArray(answer.selectedOptionIds)
        ? answer.selectedOptionIds.filter((id): id is string => typeof id === 'string')
        : answer.selectedOptionId
          ? [answer.selectedOptionId]
          : [],
    })),
    serverTime: now,
  }
}
