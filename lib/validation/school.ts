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
     * The first School Admin is required because platform accounts cannot manage
     * staff after onboarding. Both records are created in one transaction.
     */
    admin: z
      .object({
        email: emailSchema,
        password: passwordSchema,
        fullName: fullNameSchema,
      })
      .strict(),
  })
  .strict()

export const updateSchoolSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict()

export const listSchoolsSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>
export type UpdateSchoolInput = z.infer<typeof updateSchoolSchema>
