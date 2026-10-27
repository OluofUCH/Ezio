import { z } from 'zod'
import { emailSchema, fullNameSchema, paginationSchema, passwordSchema, slugSchema } from '@/lib/validation/common'

/* ------------------------------------------------------------------ *
 * Schools (SUPER_ADMIN only)
 * ------------------------------------------------------------------ */

export const createSchoolSchema = z
  .object({
    name: z.string().trim().min(2, 'School name is required.').max(160),
    slug: slugSchema,
    address: z.string().trim().max(300).optional(),
    logoUrl: z.string().trim().url('Enter a valid URL.').max(500).optional(),
    /**
     * Optional first School Admin, created in the same transaction. Onboarding a
     * school without one leaves a tenant nobody can administer (PRD §3.1), so this
     * exists to make the common path a single call.
     */
    admin: z
      .object({
        email: emailSchema,
        password: passwordSchema,
        fullName: fullNameSchema,
      })
      .strict()
      .optional(),
  })
  .strict()

export const updateSchoolSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    logoUrl: z.string().trim().url().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
    // `slug` is deliberately absent: it is the tenant key cached on LocalServers
    // (schema.prisma line 34) and student logins resolve through it. Renaming one
    // would break every provisioned offline device until it re-synced.
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update.' })

export const listSchoolsSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>
