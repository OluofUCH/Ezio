import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { createSubject, listSubjects } from '@/src/modules/school-setup/structure'
import { createSubjectSchema, structureQuerySchema } from '@/src/modules/school-setup/structure-validation'

export const runtime = 'nodejs'

export const GET = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  readQuery(req, structureQuerySchema)
  return ok({ schoolId: context.schoolId, subjects: await listSubjects(context) })
})

export const POST = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  return created({ subject: await createSubject(context, await readJson(req, createSubjectSchema)) })
})
