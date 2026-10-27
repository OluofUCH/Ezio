import { z } from 'zod'
import { ClassLevel, ExamMode, QuestionType, UserRole } from '@prisma/client'

/**
 * Shared primitives. Enum schemas are derived from the Prisma client rather than
 * retyped as string literals, so adding a class level to schema.prisma cannot
 * leave the validation layer silently behind.
 *
 * `Object.values(...)` + `z.enum` is used in preference to `z.nativeEnum`, which
 * is deprecated in Zod 4 — this form behaves identically on both majors.
 */

function fromPrismaEnum<T extends Record<string, string>>(prismaEnum: T) {
  return z.enum(Object.values(prismaEnum) as [T[keyof T], ...T[keyof T][]])
}

export const classLevelSchema = fromPrismaEnum(ClassLevel)
export const examModeSchema = fromPrismaEnum(ExamMode)
export const questionTypeSchema = fromPrismaEnum(QuestionType)
export const userRoleSchema = fromPrismaEnum(UserRole)

/**
 * Record identifiers. Kept as a shape check rather than a strict cuid matcher:
 * the schema's `@default(cuid())` could move to cuid2 or uuid without this
 * needing to change, and the real authority on whether an id exists is the
 * tenant-scoped query that follows.
 */
export const idSchema = z
  .string()
  .trim()
  .min(1, 'Required.')
  .max(64, 'Not a valid identifier.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Not a valid identifier.')

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Enter a valid email address.')

/**
 * Staff passwords. Length is the requirement that actually matters; a composition
 * rule ("one symbol, one digit") mostly produces `Password1!` and would be worse.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(200, 'Password must be at most 200 characters.')

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter a full name.')
  .max(120)
  // Collapse the double spaces that come out of spreadsheet exports.
  .transform((value) => value.replace(/\s+/g, ' '))

/**
 * Registration numbers are upper-cased on write and on read so a student typing
 * `stu001` matches a roster imported as `STU001`. See `normaliseRegNumber` in
 * lib/auth/student-credentials.ts — the same transform is applied at login.
 */
export const regNumberSchema = z
  .string()
  .trim()
  .min(1, 'Registration number is required.')
  .max(60)
  .transform((value) => value.toUpperCase().replace(/\s+/g, ' '))

export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits.')

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Slug must be at least 2 characters.')
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens, e.g. "grace-academy".')

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Capped so a single call can't be used to pull an entire roster in one response.
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

export type Pagination = z.infer<typeof paginationSchema>

export function paginate({ page, pageSize }: Pagination) {
  return { skip: (page - 1) * pageSize, take: pageSize }
}

export function pageMeta(total: number, { page, pageSize }: Pagination) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

/* ------------------------------------------------------------------ *
 * Path params
 * ------------------------------------------------------------------ */

/** Validate a dynamic route segment. Path params are user input like any other. */
export function parseParam(value: string | undefined, label = 'identifier'): string {
  const result = idSchema.safeParse(value)
  if (!result.success) {
    throw new z.ZodError([
      { code: 'custom', path: [label], message: `Invalid ${label} in the request path.` },
    ] as never)
  }
  return result.data
}
