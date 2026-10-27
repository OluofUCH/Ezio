import { z } from 'zod'
import { idSchema, paginationSchema } from '@/lib/validation/common'

/* ------------------------------------------------------------------ *
 * Local servers (SCHOOL_ADMIN / SUPER_ADMIN — PRD §2)
 *
 * A teacher creates exams; provisioning hall hardware is the School Admin's job, so
 * these are gated by `canManageSchool` rather than plain `requireSchoolScope`.
 * ------------------------------------------------------------------ */

/**
 * No `deviceKey` field anywhere in this file, on create or update.
 *
 * The key is minted server-side by `generateDeviceKey()` and returned once. Letting a
 * client choose it would allow a weak or shared key across halls, and letting a client
 * *set* it would turn provisioning into a way to overwrite another device's credential.
 * Replacing a key is `POST /api/local-servers/[id]/rotate-key`, which mints a fresh one.
 */
export const createLocalServerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Give the server a recognisable name, e.g. "Exam Hall A".')
      .max(120)
      .transform((value) => value.replace(/\s+/g, ' ')),
  })
  .strict()

export const updateLocalServerSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    /**
     * The revocation switch. `requireDevice` re-reads this on every sync call, so
     * flipping it to false stops a lost or decommissioned machine on its next request
     * without needing to rotate the key.
     */
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update.' })

export const claimLocalServerSchema = z
  .object({
    setupCode: z.string().trim().min(8).max(40),
    machineName: z.string().trim().min(1).max(120).optional(),
    appVersion: z.string().trim().max(40).optional(),
  })
  .strict()

export type ClaimLocalServerInput = z.infer<typeof claimLocalServerSchema>

export const listLocalServersSchema = paginationSchema.extend({
  search: z.string().trim().max(100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

/* ------------------------------------------------------------------ *
 * Sync — pull
 * ------------------------------------------------------------------ */

/**
 * Pull is scoped to one exam, per PRD §3.4 step 1: "only the relevant class's roster
 * and exam need to be synced". A whole-school pull would put every class's PINs and
 * every exam's answer key on a hall machine that only needs one paper.
 */
export const pullSyncSchema = z
  .object({
    examId: idSchema,
  })
  .strict()

/* ------------------------------------------------------------------ *
 * Sync — push
 * ------------------------------------------------------------------ */

/**
 * What a LocalServer sends up after an exam.
 *
 * Note what is absent: `score` and `maxScore`. The cloud re-grades from the selections
 * below using its own `Option.isCorrect`, so a tampered hall server cannot write a
 * score it did not earn. Accepting a device-supplied score would make every offline
 * result only as trustworthy as the least-secured machine in the school.
 *
 * Also absent: `isCorrect` / `pointsAwarded` per answer, for the same reason.
 */
const pushedAnswerSchema = z
  .object({
    questionId: idSchema,
    selectedOptionIds: z
      .array(idSchema)
      .max(4, 'A question has at most 4 options.')
      .transform((ids) => [...new Set(ids)]),
  })
  .strict()

/**
 * Timestamps are trusted, within reason.
 *
 * They were recorded by the hall server's clock and cannot be re-derived here — the
 * cloud has no idea when a device that was offline for two days actually ran its exam.
 * `startedAt`/`submittedAt` are therefore accepted as reported. They are audit metadata
 * only: nothing about grading depends on them, so a wrong clock skews a report rather
 * than changing a mark.
 */
const pushedSessionSchema = z
  .object({
    /** The id generated on the device. Half of the `(localServerId, localId)` idempotency key. */
    localId: idSchema,
    examId: idSchema,
    studentId: idSchema,
    // FLAGGED is accepted but not IN_PROGRESS: an unfinished sitting has nothing to
    // reconcile, and pushing one would consume an attempt for an exam never submitted.
    status: z.enum(['SUBMITTED', 'AUTO_SUBMITTED', 'FLAGGED']),
    startedAt: z.coerce.date(),
    submittedAt: z.coerce.date(),
    securityFlags: z
      .array(
        z
          .object({
            type: z.string().trim().min(1).max(40),
            at: z.string().trim().min(1).max(40),
          })
          .strict(),
      )
      .max(200)
      .optional(),
    /**
     * Monotonic per session on the device. A re-push with a *higher* version replaces
     * what the cloud holds; equal or lower is a no-op. That is the whole conflict
     * policy (PRD §4.3) — enough for "the device corrected something and re-sent",
     * without a merge UI nobody asked for.
     */
    syncVersion: z.coerce.number().int().min(1).default(1),
    answers: z.array(pushedAnswerSchema).max(500),
  })
  .strict()

export const pushSyncSchema = z
  .object({
    /**
     * Batched, and capped. A hall of 40 machines is the normal case; the ceiling keeps
     * one request from carrying an entire term's backlog and timing out mid-transaction,
     * which — because each session commits independently — the device can simply
     * continue from on its next call.
     */
    sessions: z.array(pushedSessionSchema).min(1).max(200),
  })
  .strict()

export type CreateLocalServerInput = z.infer<typeof createLocalServerSchema>
export type UpdateLocalServerInput = z.infer<typeof updateLocalServerSchema>
export type PushSyncInput = z.infer<typeof pushSyncSchema>
export type PushedSession = z.infer<typeof pushedSessionSchema>
