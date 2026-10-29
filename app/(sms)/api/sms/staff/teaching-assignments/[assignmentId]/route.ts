import { ok, readJson, route } from '@/lib/api'
import { parseParam } from '@/lib/validation/common'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { setTeachingAssignmentStatus } from '@/src/modules/staff/service'
import { assignmentStatusSchema } from '@/src/modules/staff/validation'

export const runtime = 'nodejs'

export const PATCH = route<{ assignmentId: string }>(async (req, ctx) => {
  const context = await requireSmsAdministrator(req)
  const assignmentId = parseParam((await ctx.params).assignmentId, 'assignmentId')
  return ok({ assignment: await setTeachingAssignmentStatus(context, assignmentId, await readJson(req, assignmentStatusSchema)) })
})
