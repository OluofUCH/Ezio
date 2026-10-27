import { unscopedDb } from '@/lib/db'
import { ApiError, notFound } from '@/lib/errors'

/**
 * TENANT ISOLATION
 * ================
 *
 * PRD §4.1 requires isolation "enforced at the query layer — every DB call scoped
 * by the authenticated user/student's schoolId". This module is that enforcement.
 * `schoolId` always arrives from a verified JWT; it is never read from a request
 * body, query string, or path parameter by anything below.
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

/** Models carrying `schoolId` directly — scopable with a scalar filter. */
const DIRECT_MODELS = new Set(['User', 'Student', 'Exam', 'LocalServer'])

/**
 * Models that reach their school through a relation, and the path to it.
 *
 * Typed as a plain object rather than `Prisma.InputJsonValue`: these are merged into a
 * `where` with object spread below, and `InputJsonValue` admits primitives, so a JSON
 * type here makes the spread unsound. `Record<string, unknown>` is the honest shape —
 * Prisma's own filter types can't describe "a where fragment for an unknown model".
 */
const RELATION_PATHS: Record<string, (schoolId: string) => Record<string, unknown>> = {
  Question: (schoolId) => ({ exam: { schoolId } }),
  Option: (schoolId) => ({ question: { exam: { schoolId } } }),
  ExamSession: (schoolId) => ({ exam: { schoolId } }),
  Answer: (schoolId) => ({ examSession: { exam: { schoolId } } }),
}

/**
 * `Answer` is exempt from the unique-write block. Its unique key is
 * (examSessionId, questionId), and `examSessionId` can only have come from
 * `resolveSession()` — so the tenant scope is inherited from an already-verified
 * parent and re-deriving it would be theatre.
 */
const UNIQUE_WRITE_EXEMPT = new Set(['Answer'])

/** Operations whose `where` accepts arbitrary filters, including relations. */
const FILTERABLE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
])

/** Operations requiring a unique `where` — scalar filters only. */
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert'])

const CREATE_OPS = new Set(['create', 'createMany', 'upsert'])

function misuse(model: string, operation: string): ApiError {
  const isRead = operation.startsWith('find')
  const advice = isRead
    ? `use \`${model.charAt(0).toLowerCase() + model.slice(1)}.findFirst({ where: { id } })\`, which is scoped automatically, or a resolve* helper from lib/tenant.ts`
    : `use \`${operation === 'delete' ? 'deleteMany' : 'updateMany'}({ where: { id }, ... })\` + \`assertAffected()\`, which is scoped automatically and atomic`

  return new ApiError(
    500,
    'CONFIGURATION_ERROR',
    `Tenant safety: ${model}.${operation}() cannot be tenant-scoped, because ${model} reaches its school through a relation and a unique \`where\` accepts only scalar filters. Instead, ${advice}.`,
  )
}

/**
 * Returns a Prisma client permanently scoped to one school.
 *
 * @param schoolId Always from a verified session token — never from user input.
 */
export function tenantClient(schoolId: string) {
  if (!schoolId) {
    throw new ApiError(500, 'CONFIGURATION_ERROR', 'tenantClient() called without a schoolId.')
  }

  return unscopedDb.$extends({
    name: `tenant:${schoolId}`,
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          const isDirect = DIRECT_MODELS.has(model)
          const relationPath = RELATION_PATHS[model]
          const isSchool = model === 'School'

          // Models with no tenant dimension pass through untouched.
          if (!isDirect && !relationPath && !isSchool) return query(args)

          const tenantFilter = isDirect
            ? { schoolId }
            : isSchool
              ? { id: schoolId }
              : relationPath!(schoolId)

          if (FILTERABLE_OPS.has(operation)) {
            // AND-composition, not object spread: a caller-supplied `where` may
            // contain OR/NOT branches, and merging by key would let
            // `where: { schoolId: <other> }` silently replace the tenant filter.
            // Under AND both must hold, so the scope is unconditional.
            args.where = args.where ? { AND: [args.where, tenantFilter] } : tenantFilter
          } else if (UNIQUE_OPS.has(operation)) {
            if (isDirect || isSchool) {
              // Prisma's extended-unique-where permits extra scalar filters
              // alongside the unique field, but the unique field must stay at the
              // top level — so this merge is flat rather than AND-wrapped.
              // tenantFilter goes last so it always wins a key collision.
              args.where = { ...(args.where ?? {}), ...tenantFilter }
            } else if (!UNIQUE_WRITE_EXEMPT.has(model)) {
              throw misuse(model, operation)
            }
          }

          // Stamp schoolId onto writes so a create can't land in another tenant.
          if (CREATE_OPS.has(operation) && isDirect) {
            if (operation === 'upsert' && args.create) {
              args.create = { ...args.create, ...tenantFilter }
            } else if (Array.isArray(args.data)) {
              args.data = args.data.map((row: object) => ({ ...row, ...tenantFilter }))
            } else if (args.data) {
              args.data = { ...args.data, ...tenantFilter }
            }
          }

          return query(args)
        },
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
