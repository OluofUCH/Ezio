import { ok, readJson, route } from '@/lib/api'
import { parseParam } from '@/lib/validation/common'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { setFormTeacher } from '@/src/modules/staff/service'
import { formTeacherSchema } from '@/src/modules/staff/validation'

export const runtime = 'nodejs'

export const PUT = route<{ armId: string }>(async (req, ctx) => {
  const context = await requireSmsAdministrator(req)
  const armId = parseParam((await ctx.params).armId, 'armId')
  return ok({ arm: await setFormTeacher(context, armId, await readJson(req, formTeacherSchema)) })
})
