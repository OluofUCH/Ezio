import { isQuestionType, type QuestionType } from '@/lib/core/domain'
import {
  assertOptionsBelongToQuestion,
  buildStudentPaper,
  gradeAnswer,
  type GradableQuestion,
  type StudentFacingQuestion,
} from '@/lib/core/grading-rules'
import { conflict, forbidden, notFound } from '@/lib/errors'
import {
  examWindowState,
  isWithinExamWindow,
  isWriteWindowClosed,
  secondsRemaining,
  sessionDeadline,
} from '@/lib/timing'
import { db } from '@local/db'
import { toGradable, toStorageColumns } from '@local/exam/storage'
import type { AuthenticatedStudent } from '@local/auth/student'

/**
 * THE OFFLINE EXAM ENGINE
 * =======================
 *
 * PRD §3.4 step 3: "exam proceeds identically to online mode, but all reads/writes hit the
 * LocalServer, not the cloud."
 *
 * "Identically" is enforced by construction rather than by care: every rule that decides
 * what a student sees or scores is imported from the cloud's own modules —
 * `buildStudentPaper`, `gradeAnswer`, `assertOptionsBelongToQuestion`, and the whole of
 * `../lib/timing.ts`. What lives in this file is only the SQLite plumbing around them.
 *
 * The consequence worth stating: because `buildStudentPaper` seeds its shuffle from
 * `studentId + examId` and both runtimes use the same cloud student id, a student sitting
 * offline sees the *same question order* they would have seen online, and a teacher
 * auditing the paper from the cloud months later can reproduce it exactly — even though
 * the hall machine that served it has long been reimaged.
 *
 * Timing is server-authoritative here in the same sense as online: deadlines derive from
 * `startedAt` and this machine's clock, never from anything a browser sends. The clock is
 * the one genuinely weaker link offline, which is why `pull` reports drift against the
 * cloud's time.
 */

/** Guard against a corrupted cache before handing a row to the shared rules. */
function questionType(value: string): QuestionType {
  if (!isQuestionType(value)) {
    throw conflict(
      `Question type "${value}" is not recognised — this machine's cached copy of the exam looks corrupt. Re-run \`npm run pull\`.`,
    )
  }
  return value
}

type ExamRow = {
  id: string
  title: string
  subject: string
  classLevel: string
  durationMins: number
  mode: string
  shuffleQuestions: boolean
  shuffleOptions: boolean
  maxAttempts: number
  startWindow: Date | null
  endWindow: Date | null
}

/** Shape `lib/timing.ts` needs. Built explicitly so the two never drift apart. */
function timing(exam: { durationMins: number; endWindow: Date | null }) {
  return { durationMins: exam.durationMins, endWindow: exam.endWindow }
}

/* ================================================================== *
 * Browsing
 * ================================================================== */

/**
 * Exams staged on this machine that this student may sit.
 *
 * Filtered by `classLevel` in the query, not in the response — the same
 * enforced-at-the-query-layer rule as the cloud (PRD §3.2). A machine may hold several
 * staged papers if more than one class is examined in the same hall.
 */
export async function listExamsForStudent(student: AuthenticatedStudent) {
  const exams = await db.exam.findMany({
    where: { classLevel: student.classLevel },
    orderBy: { pulledAt: 'desc' },
    include: { _count: { select: { questions: true } } },
  })

  const sessions = await db.examSession.findMany({
    where: { studentId: student.id },
    select: { id: true, examId: true, status: true, startedAt: true, score: true, maxScore: true },
  })

  const now = new Date()

  return exams.map((exam) => {
    const own = sessions.filter((session) => session.examId === exam.id)
    const active = own.find((session) => session.status === 'IN_PROGRESS')
    const attemptsUsed = own.filter((session) => session.status !== 'IN_PROGRESS').length
    const windowState = examWindowState(exam, now)

    return {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      classLevel: exam.classLevel,
      durationMins: exam.durationMins,
      questionCount: exam._count.questions,
      windowState,
      attempts: { used: attemptsUsed, allowed: exam.maxAttempts, remaining: Math.max(0, exam.maxAttempts - attemptsUsed) },
      activeSession: active
        ? {
            id: active.id,
            secondsRemaining: secondsRemaining({ startedAt: active.startedAt, exam: timing(exam) }, now),
          }
        : null,
      canStart: windowState === 'OPEN' && attemptsUsed < exam.maxAttempts && exam._count.questions > 0 && !active,
    }
  })
}

/* ================================================================== *
 * Starting / resuming
 * ================================================================== */

async function loadExamForStudent(student: AuthenticatedStudent, examId: string): Promise<ExamRow> {
  const exam = await db.exam.findUnique({ where: { id: examId } })
  if (!exam) throw notFound('That exam is not staged on this server.')

  /**
   * The class-level check, applied offline exactly as online. A student hitting this LAN
   * API directly with another class's exam id is refused here, not merely in a UI — the
   * attack PRD §3.2 calls out does not become viable just because the server moved.
   */
  if (exam.classLevel !== student.classLevel) {
    throw forbidden(
      `This exam is for ${exam.classLevel} students. You are registered as ${student.classLevel}.`,
    )
  }

  return exam
}

/**
 * Begin or resume an attempt.
 *
 * Resumes rather than errors when a session is already open — a student whose browser
 * crashed or whose machine was swapped mid-exam must land back in their paper with their
 * answers intact, which offline is a more likely scenario than online.
 */
export async function startExam(student: AuthenticatedStudent, examId: string) {
  const exam = await loadExamForStudent(student, examId)
  const now = new Date()

  if (!isWithinExamWindow(exam, now)) {
    throw conflict(
      exam.startWindow && now < exam.startWindow
        ? `This exam opens at ${exam.startWindow.toISOString()}.`
        : 'This exam is closed.',
    )
  }

  const questionCount = await db.question.count({ where: { examId } })
  if (questionCount === 0) {
    throw conflict('This exam has no questions on this server. Tell your invigilator.')
  }

  const open = await db.examSession.findFirst({
    where: { examId, studentId: student.id, status: 'IN_PROGRESS' },
  })

  if (open) {
    // An open session whose clock already expired is closed and graded here, which also
    // frees a remaining attempt if the student has one.
    if (!isWriteWindowClosed({ startedAt: open.startedAt, exam: timing(exam) }, now)) {
      return buildPaperResponse(student, exam, open.id, open.startedAt, now, true)
    }
    await submitAndGradeLocal(open.id, 'AUTO_SUBMITTED')
  }

  const attemptsUsed = await db.examSession.count({
    where: { examId, studentId: student.id, status: { not: 'IN_PROGRESS' } },
  })

  if (attemptsUsed >= exam.maxAttempts) {
    throw conflict(
      `You have used all ${exam.maxAttempts} permitted attempt${exam.maxAttempts === 1 ? '' : 's'} for this exam.`,
    )
  }

  /**
   * Created inside a transaction that re-checks for an open session.
   *
   * The cloud relies on a partial unique index for this; SQLite via Prisma cannot express
   * one (see the note in schema.prisma), so the guard is application-level. Sufficient here
   * because this is a single Node process serving one hall — there is no second instance to
   * race with, only two clicks from the same student.
   */
  const session = await db.$transaction(async (tx) => {
    const raced = await tx.examSession.findFirst({
      where: { examId, studentId: student.id, status: 'IN_PROGRESS' },
      select: { id: true, startedAt: true },
    })
    if (raced) return raced

    return tx.examSession.create({
      data: { examId, studentId: student.id },
      select: { id: true, startedAt: true },
    })
  })

  return buildPaperResponse(student, exam, session.id, session.startedAt, now, false)
}

/**
 * Assemble the paper plus any answers already saved.
 *
 * Projected into `StudentFacingQuestion`, which has no field for `isCorrect` — so even
 * though this machine holds the answer key in the very same table, it cannot reach a
 * student through this response without a type error.
 */
async function buildPaperResponse(
  student: AuthenticatedStudent,
  exam: ExamRow,
  sessionId: string,
  startedAt: Date,
  now: Date,
  resumed: boolean,
) {
  const [questions, savedAnswers] = await Promise.all([
    db.question.findMany({
      where: { examId: exam.id },
      orderBy: { orderIndex: 'asc' },
      include: { options: { orderBy: { orderIndex: 'asc' } } },
    }),
    db.answer.findMany({
      where: { examSessionId: sessionId },
      select: { questionId: true, selectedOptionId: true, selectedOptionIds: true },
    }),
  ])

  const facing: StudentFacingQuestion[] = questions.map((question) => ({
    id: question.id,
    text: question.text,
    type: questionType(question.type),
    points: question.points,
    orderIndex: question.orderIndex,
    // `isCorrect` dropped here — this projection is the boundary.
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      orderIndex: option.orderIndex,
    })),
  }))

  const paper = buildStudentPaper(facing, {
    studentId: student.id,
    examId: exam.id,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
  })

  const timed = { startedAt, exam: timing(exam) }

  return {
    session: {
      id: sessionId,
      startedAt,
      deadline: sessionDeadline(timed),
      secondsRemaining: secondsRemaining(timed, now),
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
    savedAnswers: savedAnswers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionIds: toGradable({ id: '', ...answer }).selectedOptionIds,
    })),
    serverTime: now,
  }
}

/* ================================================================== *
 * Session access + deadline enforcement
 * ================================================================== */

async function loadOwnSession(student: AuthenticatedStudent, sessionId: string) {
  const session = await db.examSession.findFirst({
    where: { id: sessionId, studentId: student.id },
    include: { exam: true },
  })
  if (!session) throw notFound('Exam session not found.')
  return session
}

/**
 * The auto-submit safeguard, offline. Identical intent to the cloud's
 * `enforceSessionDeadline`: the next request a client makes after its deadline is what
 * closes and grades its own session, so a patched or frozen browser countdown buys nothing.
 */
async function enforceDeadline(
  session: { id: string; status: string; startedAt: Date; exam: { durationMins: number; endWindow: Date | null } },
  now: Date,
): Promise<{ expired: boolean; secondsRemaining: number }> {
  const timed = { startedAt: session.startedAt, exam: timing(session.exam) }

  if (session.status !== 'IN_PROGRESS') return { expired: false, secondsRemaining: 0 }

  if (!isWriteWindowClosed(timed, now)) {
    return { expired: false, secondsRemaining: secondsRemaining(timed, now) }
  }

  await submitAndGradeLocal(session.id, 'AUTO_SUBMITTED')
  return { expired: true, secondsRemaining: 0 }
}

/** Refuse to proceed on a closed or expired session, auto-submitting first. */
async function requireOpen(
  session: { id: string; status: string; startedAt: Date; exam: { durationMins: number; endWindow: Date | null } },
  now: Date,
): Promise<number> {
  if (session.status !== 'IN_PROGRESS') {
    throw conflict('This exam session is no longer open.', 'SESSION_ALREADY_CLOSED')
  }
  const check = await enforceDeadline(session, now)
  if (check.expired) {
    throw conflict('Time expired — this exam has been submitted automatically.', 'SESSION_EXPIRED_AUTOSUBMITTED')
  }
  return check.secondsRemaining
}

/* ================================================================== *
 * Autosave
 * ================================================================== */

/**
 * Save one answer (PRD §3.3 step 4, applied offline).
 *
 * Matters more here than online: a hall of shared desktops on unreliable mains power is
 * exactly where per-answer persistence earns its keep.
 */
export async function saveAnswer(
  student: AuthenticatedStudent,
  sessionId: string,
  questionId: string,
  selectedOptionIds: string[],
) {
  const now = new Date()
  const session = await loadOwnSession(student, sessionId)
  const remaining = await requireOpen(session, now)

  const question = await db.question.findFirst({
    where: { id: questionId, examId: session.examId },
    include: { options: { select: { id: true } } },
  })
  if (!question) throw notFound('Question not found on this exam.')

  const type = questionType(question.type)

  // Shared guard: rejects another question's option, and a second option on a
  // single-answer type.
  assertOptionsBelongToQuestion({ id: question.id, type, options: question.options }, selectedOptionIds)

  const columns = toStorageColumns(type, selectedOptionIds)

  await db.answer.upsert({
    where: { examSessionId_questionId: { examSessionId: sessionId, questionId } },
    create: { examSessionId: sessionId, questionId, ...columns, answeredAt: now },
    // Verdict fields cleared: grading happens at submission, and a re-save must not leave
    // a stale one behind.
    update: { ...columns, answeredAt: now, isCorrect: null, pointsAwarded: null },
  })

  return { saved: true, questionId, selectedOptionIds, secondsRemaining: remaining, serverTime: now }
}

/* ================================================================== *
 * Grading + submission
 * ================================================================== */

export type LocalSubmissionResult = {
  status: 'SUBMITTED' | 'AUTO_SUBMITTED'
  score: number
  maxScore: number
  percentage: number
  answeredCount: number
  totalQuestions: number
}

/**
 * Close and grade a session.
 *
 * Mirrors the cloud's `submitAndGrade`, including the compare-and-set on `status` that makes
 * a double-tapped Submit produce one grading pass rather than two. The verdicts come from
 * the shared `gradeAnswer`, so a mark earned in this hall equals the mark the cloud will
 * independently compute when these answers are pushed — the two are not merely similar,
 * they are the same function over the same data.
 */
export async function submitAndGradeLocal(
  sessionId: string,
  status: 'SUBMITTED' | 'AUTO_SUBMITTED',
): Promise<LocalSubmissionResult> {
  return db.$transaction(async (tx) => {
    const submittedAt = new Date()

    const claimed = await tx.examSession.updateMany({
      where: { id: sessionId, status: 'IN_PROGRESS' },
      data: { status, submittedAt },
    })
    if (claimed.count === 0) {
      throw conflict('This exam session has already been submitted.', 'SESSION_ALREADY_CLOSED')
    }

    const session = await tx.examSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { examId: true },
    })

    const [questions, answers] = await Promise.all([
      tx.question.findMany({
        where: { examId: session.examId },
        select: { id: true, type: true, points: true, options: { select: { id: true, isCorrect: true } } },
      }),
      tx.answer.findMany({
        where: { examSessionId: sessionId },
        select: { id: true, questionId: true, selectedOptionId: true, selectedOptionIds: true },
      }),
    ])

    const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer]))

    let score = 0
    let maxScore = 0
    let answeredCount = 0

    for (const question of questions) {
      maxScore += question.points

      const stored = answersByQuestion.get(question.id)
      const gradable: GradableQuestion = {
        id: question.id,
        type: questionType(question.type),
        points: question.points,
        options: question.options,
      }

      // toGradable is what turns SQLite's TEXT column back into a real array — without it
      // every multiple-choice answer would grade as wrong (see exam/storage.ts).
      const answer = stored ? toGradable(stored) : undefined
      const verdict = gradeAnswer(gradable, answer)
      score += verdict.pointsAwarded

      if (!stored) continue
      if (answer && (answer.selectedOptionIds as string[]).length > 0) answeredCount++

      await tx.answer.update({
        where: { id: stored.id },
        data: { isCorrect: verdict.isCorrect, pointsAwarded: verdict.pointsAwarded },
      })
    }

    await tx.examSession.update({ where: { id: sessionId }, data: { score, maxScore } })

    return {
      status,
      score,
      maxScore,
      percentage: maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0,
      answeredCount,
      totalQuestions: questions.length,
    }
  })
}

/** Student-initiated submission. */
export async function submitExam(student: AuthenticatedStudent, sessionId: string) {
  const now = new Date()
  const session = await loadOwnSession(student, sessionId)
  await requireOpen(session, now)

  const result = await submitAndGradeLocal(sessionId, 'SUBMITTED')

  return {
    session: { id: sessionId, status: result.status, submittedAt: new Date() },
    result: { ...result, unansweredCount: result.totalQuestions - result.answeredCount },
    exam: { id: session.examId, title: session.exam.title },
    /**
     * Stated to the student because offline it is genuinely true and worth knowing: the
     * result is recorded on this machine and reaches the school's records when the
     * invigilator syncs.
     */
    note: 'Your answers are saved on this exam server. Your school will upload them when internet is available.',
  }
}

/* ================================================================== *
 * Heartbeat + security flags
 * ================================================================== */

export async function heartbeat(student: AuthenticatedStudent, sessionId: string) {
  const now = new Date()
  const session = await loadOwnSession(student, sessionId)
  const check = await enforceDeadline(session, now)

  const [answeredCount, totalQuestions] = await Promise.all([
    db.answer.count({ where: { examSessionId: sessionId } }),
    db.question.count({ where: { examId: session.examId } }),
  ])

  const fresh = check.expired
    ? await db.examSession.findUnique({
        where: { id: sessionId },
        select: { status: true, submittedAt: true, score: true, maxScore: true },
      })
    : null

  const status = fresh?.status ?? session.status
  const isOpen = status === 'IN_PROGRESS'

  return {
    session: {
      id: sessionId,
      status,
      startedAt: session.startedAt,
      submittedAt: fresh?.submittedAt ?? session.submittedAt,
      deadline: sessionDeadline({ startedAt: session.startedAt, exam: timing(session.exam) }),
      secondsRemaining: isOpen ? check.secondsRemaining : 0,
    },
    progress: { answeredCount, totalQuestions, unansweredCount: Math.max(0, totalQuestions - answeredCount) },
    autoSubmitted: check.expired,
    result: isOpen ? null : { score: fresh?.score ?? session.score, maxScore: fresh?.maxScore ?? session.maxScore },
    serverTime: now,
  }
}

/** Ceiling on retained flags, matching the cloud's `MAX_SECURITY_FLAGS`. */
const MAX_FLAGS = 200

/**
 * Append malpractice signals (PRD §4.4).
 *
 * As in the cloud, `status` is deliberately left IN_PROGRESS — a blur event is logged for
 * an invigilator to read, never used to end a student's exam automatically. Offline that
 * restraint matters even more: the invigilator is standing in the room and can judge for
 * themselves.
 */
export async function appendFlags(
  student: AuthenticatedStudent,
  sessionId: string,
  events: Array<{ type: string }>,
) {
  const now = new Date()
  const session = await loadOwnSession(student, sessionId)
  await requireOpen(session, now)

  let existing: Array<{ type: string; at: string }> = []
  if (session.securityFlags) {
    try {
      const parsed: unknown = JSON.parse(session.securityFlags)
      if (Array.isArray(parsed)) {
        existing = parsed.filter(
          (entry): entry is { type: string; at: string } =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { type?: unknown }).type === 'string' &&
            typeof (entry as { at?: unknown }).at === 'string',
        )
      }
    } catch {
      // Corrupt telemetry is discarded rather than allowed to fail the request.
    }
  }

  // Server-stamped: the payload carries no timestamp, so the log cannot be back-dated.
  const at = now.toISOString()
  const incoming = events.map((event) => ({ type: event.type, at }))
  const merged = [...existing, ...incoming].slice(-MAX_FLAGS)

  const updated = await db.examSession.updateMany({
    where: { id: sessionId, status: 'IN_PROGRESS' },
    data: { securityFlags: JSON.stringify(merged) },
  })
  if (updated.count === 0) throw conflict('Exam session is no longer open.', 'SESSION_ALREADY_CLOSED')

  return { recorded: incoming.length, totalFlags: merged.length }
}

/* ================================================================== *
 * Invigilator sweep
 * ================================================================== */

/**
 * Close sittings whose clock ran out but which never sent another request — a machine that
 * was switched off mid-exam. Same purpose as the cloud's `sweep-expired`, and it must run
 * before a push, because an IN_PROGRESS session is never pushed and would otherwise be
 * stranded on this machine permanently.
 */
export async function sweepExpired(): Promise<{ swept: number; stillRunning: number }> {
  const now = new Date()
  const open = await db.examSession.findMany({
    where: { status: 'IN_PROGRESS' },
    include: { exam: { select: { durationMins: true, endWindow: true } } },
  })

  let swept = 0
  let stillRunning = 0

  for (const session of open) {
    const timed = { startedAt: session.startedAt, exam: timing(session.exam) }
    if (isWriteWindowClosed(timed, now)) {
      await submitAndGradeLocal(session.id, 'AUTO_SUBMITTED')
      swept++
    } else {
      stillRunning++
    }
  }

  return { swept, stillRunning }
}
