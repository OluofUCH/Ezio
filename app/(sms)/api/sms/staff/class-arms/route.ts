import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { createClassArm, listClassArms } from '@/src/modules/school-setup/structure'
import { createClassArmSchema, structureQuerySchema } from '@/src/modules/school-setup/structure-validation'

export const runtime = 'nodejs'

export const GET = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  readQuery(req, structureQuerySchema)
  return ok({ schoolId: context.schoolId, arms: await listClassArms(context) })
})

export const POST = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  return created({ arm: await createClassArm(context, await readJson(req, createClassArmSchema)) })
})
