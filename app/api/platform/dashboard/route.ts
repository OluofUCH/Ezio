import { ok, route } from '@/lib/api'
import { requireSuperAdmin } from '@/lib/auth/session'
import { platformDashboard } from '@/src/modules/platform/service'
import { unscopedDb } from '@/lib/db'

export const runtime = 'nodejs'

export const GET = route(async req => ok(await platformDashboard(await requireSuperAdmin(req), unscopedDb)))
