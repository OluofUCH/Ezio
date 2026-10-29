import { route } from '@/lib/api'
import { requireSchoolScope } from '@/lib/auth/session'
import { importStudentRoster } from '@/src/modules/students/import'
export const runtime = 'nodejs'
export const POST = route(async (req) => importStudentRoster(req, await requireSchoolScope(req, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])))
