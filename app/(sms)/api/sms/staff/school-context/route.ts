import { ok, readJson, route } from '@/lib/api'
import { requireSuperAdmin } from '@/lib/auth/session'
import { selectSchoolSchema, selectSmsSchool } from '@/src/modules/shared/school-context'
import { SMS_SCHOOL_COOKIE, SMS_SCHOOL_TTL } from '@/src/modules/shared/school-scope-token'

export const runtime = 'nodejs'

export const POST = route(async (req) => {
  const session = await requireSuperAdmin(req)
  const selected = await selectSmsSchool(session, await readJson(req, selectSchoolSchema))
  const response = ok({ school: selected.school })
  response.cookies.set(SMS_SCHOOL_COOKIE, selected.token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SMS_SCHOOL_TTL,
  })
  return response
})
