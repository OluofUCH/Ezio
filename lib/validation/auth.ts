import { z } from 'zod'
import { emailSchema, passwordSchema, pinSchema, regNumberSchema, slugSchema } from '@/lib/validation/common'

/**
 * `.strict()` throughout: an unknown key is a rejected request, not a silently
 * ignored one. On a login endpoint that means a typo'd field name fails loudly
 * instead of authenticating against a default.
 */

export const staffLoginSchema = z
  .object({
    email: emailSchema,
    // Not `passwordSchema` — the length floor belongs on registration. Applying it
    // here would reject legacy or seeded credentials at the door and leak the
    // policy to anyone probing the form.
    password: z.string().min(1, 'Password is required.').max(200),
  })
  .strict()

export const studentLoginSchema = z
  .object({
    /**
     * Required: `Student.regNumber` is unique per school, not globally
     * (`@@unique([schoolId, regNumber])`), so a reg number alone is ambiguous.
     * A subdomain-based frontend can resolve the slug from the host and send it here.
     */
    schoolSlug: slugSchema,
    regNumber: regNumberSchema,
    pin: pinSchema,
  })
  .strict()

export type StaffLoginInput = z.infer<typeof staffLoginSchema>
export type StudentLoginInput = z.infer<typeof studentLoginSchema>

/* ------------------------------------------------------------------ *
 * Self-service password change
 * ------------------------------------------------------------------ */

/**
 * Changing your own password, as opposed to an admin rotating a colleague's
 * (`updateUserSchema.password` in validation/user.ts).
 *
 * `currentPassword` is what separates the two. An admin reset is authorised by the
 * admin's role; a self-service change is authorised by proving you know the existing
 * password — otherwise anyone with a borrowed session on an unlocked staffroom
 * machine could lock the real owner out of their account permanently.
 *
 * The floor is applied to `newPassword` only. `currentPassword` is checked against the
 * stored hash, so imposing a length rule on it would reject a legitimate holder of a
 * seeded or legacy credential at the door — the same reasoning as `staffLoginSchema`.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(200),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Your new password must be different from your current one.',
    path: ['newPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export { passwordSchema }
