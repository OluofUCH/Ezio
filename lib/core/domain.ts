/**
 * PORTABLE DOMAIN TYPES
 * =====================
 *
 * The schema's enums, restated as plain string unions with no runtime import.
 *
 * Prisma generates these for the cloud's Postgres schema, and importing them from
 * `@prisma/client` is the obvious thing to do — but it makes every module that touches
 * them unusable on a LocalServer. Two reasons:
 *
 *   1. SQLite has no enum support, so the LocalServer's own schema declares these
 *      columns as `String` and its generated client exports no such types at all.
 *   2. `@prisma/client` resolves to whichever generated client is nearest, so a shared
 *      module compiled from the LocalServer would be looking for Postgres enums in a
 *      SQLite client.
 *
 * Declared here instead, so the modules shared by both runtimes (`grading-rules.ts`,
 * `auth/student-credentials.ts`) depend on nothing generated.
 *
 * These are kept structurally identical to Prisma's generated unions, so values flow
 * both ways without casts and existing cloud code is unaffected. `lib/validation/common.ts`
 * still derives its Zod schemas from the real Prisma enums, which is what keeps this file
 * honest: if someone adds a class level to schema.prisma and forgets this list, the
 * validation layer accepts a value the shared types reject, and it fails to compile.
 */

export type ClassLevel = 'JSS1' | 'JSS2' | 'JSS3' | 'SS1' | 'SS2' | 'SS3'

export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER'

export type ExamMode = 'ONLINE' | 'OFFLINE_LAN' | 'HYBRID'

export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'

export type SessionStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'FLAGGED'

/** The fixed set, for runtime validation on the LocalServer where there is no enum. */
export const CLASS_LEVELS: readonly ClassLevel[] = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']

export const QUESTION_TYPES: readonly QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
]

export function isClassLevel(value: unknown): value is ClassLevel {
  return typeof value === 'string' && (CLASS_LEVELS as readonly string[]).includes(value)
}

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value)
}
