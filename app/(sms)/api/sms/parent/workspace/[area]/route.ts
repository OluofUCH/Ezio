import { route } from '@/lib/api'
import { parentWorkspaceGet, parentWorkspacePost } from '@/src/modules/parents/handlers'
export const runtime = 'nodejs'
export const GET = route<{ area: string }>(async (req, ctx) => parentWorkspaceGet(req, (await ctx.params).area))
export const POST = route<{ area: string }>(async (req, ctx) => parentWorkspacePost(req, (await ctx.params).area))
