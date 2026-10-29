import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { requireSmsAdministrator } from '@/src/modules/shared/school-context'
import { createAcademicSession, listAcademicCalendar } from '@/src/modules/school-setup/calendar'
import { calendarQuerySchema, createAcademicSessionSchema } from '@/src/modules/school-setup/calendar-validation'

export const runtime = 'nodejs'

export const GET = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  readQuery(req, calendarQuerySchema)
  return ok({ schoolId: context.schoolId, sessions: await listAcademicCalendar(context) })
})

export const POST = route(async (req) => {
  const context = await requireSmsAdministrator(req)
  return created({ session: await createAcademicSession(context, await readJson(req, createAcademicSessionSchema)) })
})
