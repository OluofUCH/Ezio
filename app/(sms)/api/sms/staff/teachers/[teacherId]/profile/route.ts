import { ok, readJson, route } from '@/lib/api'
import { parseParam } from '@/lib/validation/common'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { updateTeacherProfile } from '@/src/modules/staff/service'
import { updateTeacherProfileSchema } from '@/src/modules/staff/validation'

export const runtime = 'nodejs'

export const PATCH = route<{ teacherId: string }>(async (req, ctx) => {
  const context = await requireSmsAdministrator(req)
  const teacherId = parseParam((await ctx.params).teacherId, 'teacherId')
  return ok({ profile: await updateTeacherProfile(context, teacherId, await readJson(req, updateTeacherProfileSchema)) })
})
