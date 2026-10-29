import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { createTeacher, listTeachers } from '@/src/modules/staff/service'
import { createTeacherSchema, teacherListSchema } from '@/src/modules/staff/validation'

export const runtime = 'nodejs'

export const GET = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  return ok({ schoolId: context.schoolId, ...await listTeachers(context, readQuery(req, teacherListSchema)) })
})
export const POST = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  return created({ teacher: await createTeacher(context, await readJson(req, createTeacherSchema)) })
})
