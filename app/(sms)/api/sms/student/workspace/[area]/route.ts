import { route } from '@/lib/api'
import { studentWorkspaceGet } from '@/src/modules/workspace/handlers'
export const runtime = 'nodejs'
export const GET = route<{ area: string }>(async (req, ctx) => studentWorkspaceGet(req, (await ctx.params).area))
