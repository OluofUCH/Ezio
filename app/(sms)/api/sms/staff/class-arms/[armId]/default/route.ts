import { ok, readJson, route } from '@/lib/api'
import { parseParam } from '@/lib/validation/common'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { setDefaultClassArm } from '@/src/modules/school-setup/structure'
import { setDefaultArmSchema } from '@/src/modules/school-setup/structure-validation'

export const runtime = 'nodejs'

export const POST = route<{ armId: string }>(async (req, ctx) => {
  const context = await requireSmsAdministrator(req)
  await readJson(req, setDefaultArmSchema)
  const armId = parseParam((await ctx.params).armId, 'armId')
  return ok({ arm: await setDefaultClassArm(context, armId) })
})
