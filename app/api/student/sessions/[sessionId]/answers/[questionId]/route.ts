import { Prisma } from '@prisma/client'
import { ok, readJson, route } from '@/lib/api'
import { notFound } from '@/lib/errors'
import { requireStudent } from '@/lib/auth/session'
import { assertOptionsBelongToQuestion, requireOpenSession } from '@/lib/grading'
import { resolveSession } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import { saveAnswerSchema } from '@/lib/validation/session'

export const runtime = 'nodejs'

type Params = { sessionId: string; questionId: string }

/**
 * PUT /api/student/sessions/[sessionId]/answers/[questionId] — autosave one answer.
 *
 * PRD §3.3 step 4: "answers saved to server as they go (avoids full data loss on
 * disconnect)". Called once per selection change rather than in a batch at the end,
 * so a device losing power mid-exam loses at most the answer in flight.
 *
 * PUT rather than POST: the target is one specific answer identified entirely by the
 * URL, and re-sending the same request must be idempotent. A student who changes
 * their mind four times on question 3 produces one row, not four — and a client
 * retrying after a timeout cannot create a duplicate.
 *
 * The `questionId` lives in the path for the same reason: it identifies the resource
 * being written, so `saveAnswerSchema` carries only the selection itself and there is
 * no way for body and URL to disagree about which question is being answered.
 */
export const PUT = route<Params>(async (req, ctx) => {
  const { session: auth, db } = await requireStudent(req)
  const params = await ctx.params
  const sessionId = parseParam(params.sessionId, 'sessionId')
  const questionId = parseParam(params.questionId, 'questionId')

  // Passing studentId folds the ownership check into the lookup: another student's
  // session is a 404 here, not a session this route could accidentally write to.
  const session = await resolveSession(db, sessionId, auth.studentId)

  // The auto-submit safeguard, before any write is considered. If the deadline has
  // passed this grades and closes the session, then throws 409 — so a client with a
  // frozen countdown cannot save even one answer past time (lib/grading.ts).
  const secondsRemaining = await requireOpenSession(db, session)

  const input = await readJson(req, saveAnswerSchema)

  /**
   * `examId` in the filter is what stops an answer being attached to a question from
   * a different exam. The tenant client already confines this to the school, but
   * within one school a student could otherwise name any published exam's question.
   */
  const question = await db.question.findFirst({
    where: { id: questionId, examId: session.examId },
    select: { id: true, type: true, options: { select: { id: true } } },
  })
  if (!question) throw notFound('Question not found on this exam.')

  // Rejects options belonging to another question, and a second option on a
  // single-answer type. Without this the row would store cleanly and grade as
  // permanently wrong (lib/grading.ts).
  assertOptionsBelongToQuestion(question, input.selectedOptionIds)

  /**
   * Map the one input shape onto the correct storage column. Driven by the
   * question's own `type` from the database, never by anything the client sends, so
   * the two columns can never both be populated.
   *
   * `Prisma.DbNull` rather than `null` for the unused Json column: on a nullable Json
   * field, plain `null` is ambiguous between SQL NULL and the JSON value `null`, so
   * Prisma rejects it and asks which was meant. SQL NULL is what we want — the column
   * holds no array, rather than holding an array-shaped nothing — and it is what
   * `Array.isArray()` in the grader reads back as absent.
   */
  const isMulti = question.type === 'MULTIPLE_CHOICE'
  const selection = {
    selectedOptionId: isMulti ? null : (input.selectedOptionIds[0] ?? null),
    selectedOptionIds: isMulti ? input.selectedOptionIds : Prisma.DbNull,
    answeredAt: new Date(),
    // Grading fields stay null until submission writes the snapshot. Cleared
    // explicitly so a re-save can never leave a stale verdict behind.
    isCorrect: null,
    pointsAwarded: null,
  }

  /**
   * `Answer` is the one model exempt from the tenant extension's unique-write block
   * (lib/tenant.ts): its key is (examSessionId, questionId), and `examSessionId` came
   * from `resolveSession` above — so the scope is inherited from a parent that has
   * already been verified against this student and this school.
   */
  await db.answer.upsert({
    where: { examSessionId_questionId: { examSessionId: sessionId, questionId } },
    create: { examSessionId: sessionId, questionId, ...selection },
    update: selection,
  })

  // Deliberately minimal. Autosave fires on every tap from a full exam hall, so the
  // response carries only what the client needs: confirmation, and the authoritative
  // clock to correct its own countdown against.
  return ok({
    saved: true,
    questionId,
    selectedOptionIds: input.selectedOptionIds,
    secondsRemaining,
    serverTime: new Date(),
  })
})
