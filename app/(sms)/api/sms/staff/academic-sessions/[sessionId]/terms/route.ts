import { created, readJson, route } from '@/lib/api'
import { parseParam } from '@/lib/validation/common'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { createTerm } from '@/src/modules/school-setup/calendar'
import { createTermSchema } from '@/src/modules/school-setup/calendar-validation'

export const runtime = 'nodejs'

export const POST = route<{ sessionId: string }>(async (req, ctx) => {
  const context = await requireSmsAdministrator(req)
  const sessionId = parseParam((await ctx.params).sessionId, 'sessionId')
  return created({ term: await createTerm(context, sessionId, await readJson(req, createTermSchema)) })
})
