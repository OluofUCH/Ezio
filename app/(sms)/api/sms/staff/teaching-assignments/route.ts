import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { createTeachingAssignment, listTeachingAssignments } from '@/src/modules/staff/service'
import { assignmentListSchema, createTeachingAssignmentSchema } from '@/src/modules/staff/validation'

export const runtime = 'nodejs'

export const GET = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  return ok({ schoolId: context.schoolId, ...await listTeachingAssignments(context, readQuery(req, assignmentListSchema)) })
})

export const POST = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  return created({ assignment: await createTeachingAssignment(context, await readJson(req, createTeachingAssignmentSchema)) })
})
