import { ok, readJson, route } from '@/lib/api'
import { parseParam } from '@/lib/validation/common'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { updateTeacherAccount } from '@/src/modules/staff/service'
import { updateTeacherAccountSchema } from '@/src/modules/staff/validation'
export const runtime = 'nodejs'
export const PATCH = route<{ teacherId: string }>(async (req, ctx) => {
  const context = await requireSmsAdministrator(req)
  return ok({ teacher: await updateTeacherAccount(context, parseParam((await ctx.params).teacherId, 'teacherId'), await readJson(req, updateTeacherAccountSchema)) })
})
