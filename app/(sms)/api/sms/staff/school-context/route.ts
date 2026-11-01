import { route } from '@/lib/api'
import { requireStaff } from '@/lib/auth/session'
import { forbidden } from '@/lib/errors'

export const runtime = 'nodejs'

export const POST = route(async (req) => {
  await requireStaff(req)
  throw forbidden('School selection is no longer available. Sign in with a school staff account for school operations.')
})
