import { z } from 'zod'
import { emailSchema, fullNameSchema, paginationSchema, passwordSchema, userRoleSchema } from '@/lib/validation/common'

/* ------------------------------------------------------------------ *
 * Staff users — SCHOOL_ADMIN and TEACHER accounts
 * ------------------------------------------------------------------ */

/**
 * SUPER_ADMIN is excluded from anything assignable over the API. A platform owner
 * is created by the seed script only; leaving the role in this enum would make
 * privilege escalation a matter of posting one extra field. The route layer
 * re-checks this too — see `app/api/users/route.ts`.
 */
const assignableRoleSchema = userRoleSchema.exclude(['SUPER_ADMIN'])

export const createUserSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    fullName: fullNameSchema,
    role: assignableRoleSchema,
  })
  .strict()

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    role: assignableRoleSchema.optional(),
    isActive: z.boolean().optional(),
    /**
     * Admin-initiated password reset. Rotating a colleague's password is the
     * intended flow here; a self-service "change my own password" endpoint is a
     * separate concern and would require the current password.
     */
    password: passwordSchema.optional(),
    // `email` is omitted: it is both the login identifier and the unique key.
    // Changing it is an account transfer, which deserves a deliberate endpoint.
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update.' })

export const listUsersSchema = paginationSchema.extend({
  role: userRoleSchema.optional(),
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
