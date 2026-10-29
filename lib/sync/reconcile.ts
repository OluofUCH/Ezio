import { Prisma } from '@prisma/client'
import { conflict, notFound } from '@/lib/errors'
import { GRADING_SELECT, assertOptionsBelongToQuestion, gradeAnswer } from '@/lib/grading'
import { type TenantDb } from '@/lib/tenant'
import type { PushOutcome } from '@/lib/sync/payload'
import type { PushedSession } from '@/lib/validation/local-server'
import { wasEligibleOffline } from '@/src/modules/cbt-results/eligibility'

/**
 * OFFLINE SESSION RECONCILIATION
 * ==============================
 *
 * Takes one session recorded on a hall server and lands it in the cloud (PRD §3.4
 * steps 5–6, §4.3). This is the point where data written by a machine outside our
 * control enters the system, so the governing rule is:
 *
 *   TRUST THE SELECTIONS AND THE CLOCK. TRUST NOTHING ELSE.
 *
 * The device tells us which options a student picked and when they sat the paper. It
 * does NOT get to tell us what that was worth — the score is recomputed here against
 * the cloud's own `Option.isCorrect`. A hall server is a PC in a school office; if a
 * device-supplied score were taken at face value, every offline result would be only as
 * trustworthy as the least-secured machine in the building, and altering a grade would
 * require nothing more than editing a JSON body.
 *
 * Idempotency is the other half. A push happens over whatever connectivity a school
 * has, so it *will* be interrupted and retried. `(localServerId, localId)` is unique in
 * the schema precisely so a retry cannot create a second copy of the same sitting.
 */

/**
 * Rejections are thrown, and the caller turns them into a `REJECTED` outcome for that
 * one session. Throwing rather than returning keeps a single malformed session from
 * aborting an entire batch — 39 good papers in a hall of 40 still land.
 */
export type ReconcileOutcome = Extract<PushOutcome, { outcome: 'CREATED' | 'UPDATED' | 'ALREADY_SYNCED' }>

export async function reconcilePushedSession(
  db: TenantDb,
  localServerId: string,
  pushed: PushedSession,
  now: Date,
): Promise<ReconcileOutcome> {
  /* ---------------- 1. the session belongs to this tenant ---------------- */

  /**
   * Both reads go through the tenant client, so an exam or student id from another
   * school resolves to null and is rejected below. This is what contains a compromised
   * device: it can lie about anything in its payload, but it cannot name a record
   * outside the school its key was issued for.
   */
  const [exam, student] = await Promise.all([
    db.exam.findFirst({
      where: { id: pushed.examId },
      select: { id: true, title: true, classLevel: true, maxAttempts: true, termId: true },
    }),
    db.student.findFirst({
      where: { id: pushed.studentId },
      select: { id: true, regNumber: true, classLevel: true },
    }),
  ])

  if (!exam) throw notFound(`Exam ${pushed.examId} is not in this school.`)
  if (!student) throw notFound(`Student ${pushed.studentId} is not in this school.`)

  /**
   * The class-level rule (PRD §3.2/§4.2) re-checked on the way in. The device enforced
   * it at login, but that check ran on the device; enforcing it again here means an
   * offline path cannot be used to sidestep a rule the online path applies.
   */

  /* ---------------- 2. already reconciled? ---------------- */

  /**
   * `findFirst`, not `findUnique`. `ExamSession` reaches its school through a relation,
   * so the tenant extension blocks every unique-`where` operation on it and directs
   * callers to the auto-scoped primitives instead (lib/tenant.ts). That is why the
   * create/update below use `create` + P2002 and `updateMany` rather than an `upsert`.
   */
  const existing = await db.examSession.findFirst({
    where: { localServerId, localId: pushed.localId },
    select: { id: true, examId: true, studentId: true, syncVersion: true, score: true, maxScore: true },
  })

  if (existing && (existing.examId !== pushed.examId || existing.studentId !== pushed.studentId)) throw conflict('A local sitting ID cannot be reassigned to another exam or student.')

  if (existing && pushed.syncVersion <= existing.syncVersion) {
    /**
     * The retry path, and a success. A device that pushed successfully but never saw the
     * response resends the same batch; it must be told "this is already here" so it can
     * clear its local flag. Returning an error would make a flaky link retry forever.
     */
    return { localId: pushed.localId, outcome: 'ALREADY_SYNCED', sessionId: existing.id }
  }

  const withdrawn = await db.enrollment.findFirst({ where: { studentId: student.id, isCurrent: true, status: 'WITHDRAWN' }, select: { id: true } })
  if ((exam.classLevel !== student.classLevel || withdrawn) && !await wasEligibleOffline(db, localServerId, exam, student.id, pushed.startedAt)) {
    throw conflict(`${student.regNumber} is ${student.classLevel} but "${exam.title}" is a ${exam.classLevel} exam, with no historical eligibility.`, 'WRONG_CLASS_LEVEL')
  }

  /* ---------------- 3. grade against cloud data ---------------- */

  const questions = await db.question.findMany({
    where: { examId: pushed.examId },
    select: GRADING_SELECT,
  })

  if (questions.length === 0) {
    throw conflict(`"${exam.title}" has no questions in the cloud, so this session cannot be graded.`)
  }

  const questionsById = new Map(questions.map((question) => [question.id, question]))

  /**
   * An answer naming a question the exam no longer has means the device is holding a
   * stale copy of the paper — a teacher edited it after this device pulled. Rejected
   * loudly rather than silently skipped: dropping the answer would produce a score that
   * looks valid but does not correspond to the paper the student actually sat, and
   * nobody would ever know. A human needs to see this.
   */
  for (const answer of pushed.answers) {
    const question = questionsById.get(answer.questionId)
    if (!question) {
      throw conflict(
        `Question ${answer.questionId} is not part of "${exam.title}" any more — this device is holding an outdated copy of the paper. Nothing was saved for this session.`,
        'CONFLICT',
      )
    }
    // Rejects options belonging to a different question, and a second option on a
    // single-answer type. Same guard the online autosave route applies.
    assertOptionsBelongToQuestion(question, answer.selectedOptionIds)
  }

  const pushedByQuestion = new Map(pushed.answers.map((answer) => [answer.questionId, answer]))

  let score = 0
  let maxScore = 0

  /**
   * Graded row-by-row here rather than inserted-then-graded, so the verdicts go into the
   * same `createMany` as the answers themselves. One statement instead of two passes, and
   * no window in which a session exists with ungraded answers.
   */
  const answerRows = pushed.answers.map((answer) => {
    const question = questionsById.get(answer.questionId)!
    const isMulti = question.type === 'MULTIPLE_CHOICE'

    const verdict = gradeAnswer(question, {
      // `gradeAnswer` never reads `id` — it exists on the type for the stored-answer
      // case. The questionId keeps it traceable if that ever changes.
      id: answer.questionId,
      questionId: answer.questionId,
      selectedOptionId: isMulti ? null : (answer.selectedOptionIds[0] ?? null),
      selectedOptionIds: isMulti ? answer.selectedOptionIds : null,
    })

    return {
      questionId: answer.questionId,
      selectedOptionId: isMulti ? null : (answer.selectedOptionIds[0] ?? null),
      // Prisma.DbNull for the unused Json column — see the autosave route for why plain
      // null is ambiguous on a nullable Json field.
      selectedOptionIds: isMulti ? answer.selectedOptionIds : Prisma.DbNull,
      answeredAt: pushed.submittedAt,
      isCorrect: verdict.isCorrect,
      pointsAwarded: verdict.pointsAwarded,
    }
  })

  /**
   * `maxScore` spans every question on the paper, not only the answered ones, and
   * unanswered questions score zero — identical to `submitAndGrade`, so an offline mark
   * and an online mark mean the same thing. Snapshotted onto the session for the reason
   * given in schema.prisma: a later edit to the paper must not silently reinterpret a
   * recorded result.
   */
  for (const question of questions) {
    maxScore += question.points
    const answer = pushedByQuestion.get(question.id)
    if (!answer) continue
    const row = answerRows.find((candidate) => candidate.questionId === question.id)
    score += row?.pointsAwarded ?? 0
  }

  /**
   * Omitted flags are not the same as no flags. The device sends only what it recorded,
   * and a re-push (a corrected answer, a bumped `syncVersion`) may leave the field out
   * entirely. Treating that as "clear the flags" would silently erase security telemetry
   * that the cloud already holds. An explicit empty array is the way to clear them.
   *
   * `undefined` on an update means Prisma leaves the column untouched; on a create it
   * falls back to the nullable column's default (`NULL`).
   */
  const securityFlags =
    pushed.securityFlags === undefined
      ? undefined
      : pushed.securityFlags.length > 0
        ? pushed.securityFlags
        : Prisma.DbNull

  /* ---------------- 4. write ---------------- */

  if (existing) {
    /**
     * Re-push with a higher `syncVersion` — the device corrected something and resent.
     * Answers are replaced wholesale rather than merged: the device is authoritative for
     * what the student selected, so a partial merge could leave a stale answer from the
     * superseded version sitting alongside the corrected ones.
     */
    const changed = await db.$transaction(async (tx) => {
      const updated = await tx.examSession.updateMany({
        where: { id: existing.id, syncVersion: { lt: pushed.syncVersion } },
        data: {
          status: pushed.status,
          startedAt: pushed.startedAt,
          submittedAt: pushed.submittedAt,
          score,
          maxScore,
          securityFlags,
          syncedAt: now,
          syncVersion: pushed.syncVersion,
        },
      })
      if (!updated.count) return false
      await tx.answer.deleteMany({ where: { examSessionId: existing.id } })
      await tx.answer.createMany({ data: answerRows.map((row) => ({ ...row, examSessionId: existing.id })) })
      return true
    })
    if (!changed) return { localId: pushed.localId, outcome: 'ALREADY_SYNCED', sessionId: existing.id }
    return { localId: pushed.localId, outcome: 'UPDATED', sessionId: existing.id, score, maxScore }
  }

  /**
   * First arrival.
   *
   * Attempt limits are deliberately NOT enforced here. The device checked them against
   * its own cache, which may not know about an attempt the student made online. If the
   * two disagree, the student has nonetheless already sat this paper — discarding real
   * work to protect a counter would be the wrong trade. The over-count is visible in the
   * invigilation view, where a human can judge it.
   *
   * The partial unique index is not a concern: it covers `status = 'IN_PROGRESS'` only,
   * and a pushed session is always already closed.
   */
  try {
    const session = await db.examSession.create({
      data: {
        examId: pushed.examId,
        studentId: pushed.studentId,
        localServerId,
        localId: pushed.localId,
        status: pushed.status,
        startedAt: pushed.startedAt,
        submittedAt: pushed.submittedAt,
        score,
        maxScore,
        securityFlags,
        syncedAt: now,
        syncVersion: pushed.syncVersion,
        answers: { createMany: { data: answerRows } },
      } as never,
      select: { id: true },
    })

    return { localId: pushed.localId, outcome: 'CREATED', sessionId: session.id, score, maxScore }
  } catch (err) {
    /**
     * P2002 on `(localServerId, localId)` — two overlapping pushes of the same batch
     * raced past the `findFirst` above. The winner's row is the correct one, so this is
     * reported as already-synced rather than as a failure the device should retry.
     */
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      const winner = await db.examSession.findFirst({
        where: { localServerId, localId: pushed.localId },
        select: { id: true, examId: true, studentId: true, syncVersion: true },
      })
      if (winner) {
        if (winner.examId !== pushed.examId || winner.studentId !== pushed.studentId) throw conflict('Local sitting identity conflict.')
        if (winner.syncVersion < pushed.syncVersion) return reconcilePushedSession(db, localServerId, pushed, now)
        return { localId: pushed.localId, outcome: 'ALREADY_SYNCED', sessionId: winner.id }
      }
    }
    throw err
  }
}
