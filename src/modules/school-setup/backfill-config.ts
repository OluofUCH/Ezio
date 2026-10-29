import { z } from 'zod'
import { calendarDateSchema } from '@/src/modules/shared/calendar-date'

export { asDatabaseDate } from '@/src/modules/shared/calendar-date'

const name = z.string().trim().min(1).max(120)
const levels = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const
const armMap = z.object({ JSS1: name, JSS2: name, JSS3: name, SS1: name, SS2: name, SS3: name }).strict()
const armLists = z.object({
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
  for (const level of levels) {
    const configured = value.arms?.[level]
    if (!configured) continue
    const normalized = configured.map((arm) => arm.toLowerCase())
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({ code: 'custom', path: ['arms', level], message: `${level} arm names must be unique ignoring case.` })
    }
    if (!configured.includes(value.defaultArms[level])) {
      ctx.addIssue({ code: 'custom', path: ['defaultArms', level], message: `The default ${level} arm must exactly match a name in its arms list.` })
    }
  }
})

export type BackfillConfig = z.infer<typeof backfillConfigSchema>
