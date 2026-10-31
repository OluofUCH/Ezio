import { z } from 'zod'
import { calendarDateSchema } from '@/src/modules/shared/calendar-date'
import { CLASS_LEVELS } from '@/lib/core/domain'

export { asDatabaseDate } from '@/src/modules/shared/calendar-date'

const name = z.string().trim().min(1).max(120)
// Early-years mappings are optional so existing secondary-school rollout files remain valid.
const armMap = z.object({
  NURSERY1: name.optional(), NURSERY2: name.optional(),
  PRIMARY1: name.optional(), PRIMARY2: name.optional(), PRIMARY3: name.optional(),
  PRIMARY4: name.optional(), PRIMARY5: name.optional(), PRIMARY6: name.optional(),
  JSS1: name, JSS2: name, JSS3: name, SS1: name, SS2: name, SS3: name,
}).strict()
const armLists = z.object({
  NURSERY1: z.array(name).min(1).optional(), NURSERY2: z.array(name).min(1).optional(),
  PRIMARY1: z.array(name).min(1).optional(), PRIMARY2: z.array(name).min(1).optional(), PRIMARY3: z.array(name).min(1).optional(),
  PRIMARY4: z.array(name).min(1).optional(), PRIMARY5: z.array(name).min(1).optional(), PRIMARY6: z.array(name).min(1).optional(),
  JSS1: z.array(name).min(1), JSS2: z.array(name).min(1), JSS3: z.array(name).min(1),
  SS1: z.array(name).min(1), SS2: z.array(name).min(1), SS3: z.array(name).min(1),
}).strict()

// This is operator configuration, never an API input accepting a client schoolId.
export const backfillConfigSchema = z.object({
  schoolId: z.string().trim().min(1).max(128),
  session: z.object({
    name,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
  }).strict().refine((value) => value.startDate <= value.endDate, {
    message: 'Session startDate must be on or before endDate.',
    path: ['endDate'],
  }),
  defaultArms: armMap,
  arms: armLists.optional(),
}).strict().superRefine((value, ctx) => {
  for (const level of CLASS_LEVELS) {
    const configured = value.arms?.[level]
    if (!configured) continue
    const normalized = configured.map((arm) => arm.toLowerCase())
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({ code: 'custom', path: ['arms', level], message: `${level} arm names must be unique ignoring case.` })
    }
    const defaultArm = value.defaultArms[level]
    if (!defaultArm || !configured.includes(defaultArm)) {
      ctx.addIssue({ code: 'custom', path: ['defaultArms', level], message: `The default ${level} arm must exactly match a name in its arms list.` })
    }
  }
})

export type BackfillConfig = z.infer<typeof backfillConfigSchema>
