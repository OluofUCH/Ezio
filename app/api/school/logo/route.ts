import { ok, readUpload, route } from '@/lib/api'
import { requireSchoolScope } from '@/lib/auth/session'
import { normalizeSchoolLogo } from '@/lib/school-logo'
import { SCHOOL_LOGO_EXTENSIONS, SCHOOL_LOGO_MAX_BYTES } from '@/lib/validation/school-logo'

export const runtime = 'nodejs'

/** The school comes only from the authenticated school administrator's account. */
export const POST = route(async (req) => {
  const { db, schoolId } = await requireSchoolScope(req, ['SCHOOL_ADMIN'])
  const { buffer } = await readUpload(req, 'file', {
    allowedExtensions: SCHOOL_LOGO_EXTENSIONS,
    maxBytes: SCHOOL_LOGO_MAX_BYTES,
  })
  const logoUrl = await normalizeSchoolLogo(buffer)
  const school = await db.school.update({
    where: { id: schoolId },
    data: { logoUrl },
    select: { id: true, name: true, logoUrl: true },
  })
  return ok({ school })
})

export const DELETE = route(async (req) => {
  const { db, schoolId } = await requireSchoolScope(req, ['SCHOOL_ADMIN'])
  const school = await db.school.update({
    where: { id: schoolId },
    data: { logoUrl: null },
    select: { id: true, name: true, logoUrl: true },
  })
  return ok({ school })
})
