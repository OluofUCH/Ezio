import { route } from '@/lib/api'
import { staffWorkspaceGet, staffWorkspacePost } from '@/src/modules/workspace/handlers'
export const runtime = 'nodejs'
export const maxDuration = 120
export const GET = route<{ area: string }>(async (req, ctx) => staffWorkspaceGet(req, (await ctx.params).area))
export const POST = route<{ area: string }>(async (req, ctx) => staffWorkspacePost(req, (await ctx.params).area))
