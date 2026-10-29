import { Prisma } from '@prisma/client'
import { unscopedDb } from '@/lib/db'
import { ApiError, notFound } from '@/lib/errors'
import { scopeTenantArgs } from '@/lib/tenant-policy'

/**
 * TENANT ISOLATION
 * ================
 *
 * PRD §4.1 requires isolation "enforced at the query layer — every DB call scoped
 * by the authenticated user/student's schoolId". This module is that enforcement.
 * `schoolId` arrives from authenticated staff/student/device scope. Trusted
 * bootstrap/backfill commands select an explicit operator-owned scope instead.
 * Nothing below reads a request body, query string or path parameter.
 *
 * Two mechanisms, because Prisma's write API cannot carry relation filters:
 *
 *  1. A client extension injects the tenant filter into every operation that
 *     accepts an arbitrary `where`. This is automatic and cannot be forgotten.
 *
 *  2. Operations that require a *unique* `where` (findUnique/update/delete/upsert)
 *     can only take scalar filters, so models that reach their school through a
 *     relation cannot be scoped that way. For those, the extension throws a
 *     developer-facing error pointing at the right primitive:
 *       - reads  → `findFirst` (auto-scoped) or a `resolve*` helper below
 *       - writes → `updateMany`/`deleteMany` (auto-scoped) + `assertAffected`
 *     Using *Many for single-row writes is not a workaround but an upgrade: it
 *     turns check-then-write into one atomic compare-and-set.
 */

// Derive direct scope from Prisma's schema, so adding a schoolId-bearing model
// cannot silently omit it from a hand-maintained registry. Unknown/global models
// and raw operations fail closed on this client.
const policy = {
  direct: new Set(Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'schoolId' && field.kind === 'scalar'))
    .map((model) => model.name)),
  relations: new Map(Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Set(model.fields.filter((field) => field.kind === 'object').map((field) => field.name)),
  ])),
}

/**
 * Returns a Prisma client permanently scoped to one school.
 *
 * @param schoolId Verified request scope, or an explicit trusted bootstrap scope.
 */
export function tenantClient(schoolId: string) {
  if (!schoolId) {
    throw new ApiError(500, 'CONFIGURATION_ERROR', 'tenantClient() called without a schoolId.')
  }

  return unscopedDb.$extends({
    name: `tenant:${schoolId}`,
    query: {
      async $allOperations({ model, operation, args, query }) {
        scopeTenantArgs(schoolId, model, operation, args as Record<string, unknown>, policy)
        return query(args)
      },
    },
  })
}

export type TenantDb = ReturnType<typeof tenantClient>

/* ------------------------------------------------------------------ *
 * Write assertions
 * ------------------------------------------------------------------ */

/**
 * Assert that a scoped `updateMany`/`deleteMany` actually hit a row.
 *
 * `count === 0` means one of: the id doesn't exist, it belongs to another school,
 * or an additional guard in the `where` (e.g. `status: 'IN_PROGRESS'`) didn't
 * hold. All three are reported as 404 — distinguishing them would confirm to a
 * caller that another tenant's id is real.
 */
export function assertAffected(result: { count: number }, message = 'Not found.'): void {
  if (result.count === 0) throw notFound(message)
}

/* ------------------------------------------------------------------ *
 * Ownership resolvers
 *
 * A route cannot obtain a child record any other way, so the tenant check is
 * structural rather than a clause someone has to remember to write. Each throws
 * 404 when the record isn't in this tenant.
 * ------------------------------------------------------------------ */

export async function resolveExam(db: TenantDb, examId: string) {
  const exam = await db.exam.findFirst({ where: { id: examId } })
  if (!exam) throw notFound('Exam not found.')
  return exam
}

/** Exam plus the counts most callers immediately need for their guards. */
export async function resolveExamWithCounts(db: TenantDb, examId: string) {
  const exam = await db.exam.findFirst({
    where: { id: examId },
    include: { _count: { select: { questions: true, examSessions: true } } },
  })
  if (!exam) throw notFound('Exam not found.')
  return exam
}

export async function resolveQuestion(db: TenantDb, questionId: string) {
  const question = await db.question.findFirst({
    where: { id: questionId },
    include: { exam: { select: { id: true, schoolId: true, isPublished: true } } },
  })
  if (!question) throw notFound('Question not found.')
  return question
}

/**
 * Resolve an exam and assert its question set may still be modified.
 *
 * The rule: once any `ExamSession` exists, the paper is frozen. The grading
 * snapshot on `Answer` protects scores that are already recorded, but it cannot
 * protect a sitting that is still open — adding, removing or rewording a question
 * mid-exam changes the paper underneath students who are partway through it, and
 * `maxScore` for an in-flight session would no longer match what they were shown.
 *
 * Shared by every question mutation (manual create/edit/delete, bulk import) so the
 * four routes cannot drift apart on it.
 */
export async function resolveEditableExam(db: TenantDb, examId: string) {
  const exam = await resolveExamWithCounts(db, examId)

  if (exam._count.examSessions > 0) {
    throw new ApiError(
      409,
      'EXAM_HAS_SESSIONS',
      `${exam._count.examSessions} student session(s) already exist for "${exam.title}", so its questions can no longer be changed. Duplicate the exam if you need a corrected version.`,
    )
  }

  return exam
}

export async function resolveStudent(db: TenantDb, studentId: string) {
  const student = await db.student.findFirst({ where: { id: studentId } })
  if (!student) throw notFound('Student not found.')
  return student
}

export async function resolveUser(db: TenantDb, userId: string) {
  const user = await db.user.findFirst({ where: { id: userId } })
  if (!user) throw notFound('User not found.')
  return user
}

/**
 * Resolve a session together with the exam fields the timer and grader need.
 *
 * `studentId` should be passed for student-facing routes: a student may only ever
 * touch their own session, and folding that into the same query removes a
 * separate ownership check (and the chance of omitting it).
 */
export async function resolveSession(db: TenantDb, sessionId: string, studentId?: string) {
  const session = await db.examSession.findFirst({
    where: { id: sessionId, ...(studentId ? { studentId } : {}) },
    include: {
      exam: {
        select: {
          id: true,
          title: true,
          durationMins: true,
          endWindow: true,
          classLevel: true,
          shuffleQuestions: true,
          shuffleOptions: true,
          maxAttempts: true,
        },
      },
    },
  })
  if (!session) throw notFound('Exam session not found.')
  return session
}

export type ResolvedSession = Awaited<ReturnType<typeof resolveSession>>
