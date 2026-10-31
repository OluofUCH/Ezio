import { NextResponse, type NextRequest } from 'next/server'
import { ok, created, readJson, readQuery } from '@/lib/api'
import { notFound } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { requireSmsParent } from '@/src/modules/shared/school-context'
import { reportPdf } from '@/src/modules/results/pdf'
import { assertParentChild, parentChildren, childReports, listComments, postComment } from './service'
import { commentQuerySchema, commentSchema, parentChildrenQuerySchema } from './validation'

export async function parentWorkspaceGet(req: NextRequest, area: string) {
  const ctx = await requireSmsParent(req)
  switch (area) {
    case 'children': return ok({ children: await parentChildren(ctx) })
    case 'reports': return ok({ reports: await childReports(ctx, readQuery(req, parentChildrenQuerySchema).studentId) })
    case 'comments': return ok(await listComments(ctx, readQuery(req, commentQuerySchema)))
    case 'report-pdf': {
      const report = await ctx.db.reportCard.findFirst({ where: { id: idSchema.parse(req.nextUrl.searchParams.get('id')), status: 'PUBLISHED', enrollment: { student: { parents: { some: { parentId: ctx.session.parentId, isActive: true } } } } }, include: { enrollment: { select: { studentId: true } } } })
      if (!report) throw notFound('Published report not found.')
      await assertParentChild(ctx, report.enrollment.studentId)
      return new NextResponse(new Uint8Array(await reportPdf(ctx.db, report)), { headers: {
        'content-type': 'application/pdf', 'content-disposition': `attachment; filename="report-${report.id.replace(/[^a-z0-9_-]/gi, '')}.pdf"`, 'cache-control': 'private, no-store',
      } })
    }
    default: throw notFound('Parent endpoint not found.')
  }
}

export async function parentWorkspacePost(req: NextRequest, area: string) {
  const ctx = await requireSmsParent(req)
  if (area !== 'comments') throw notFound('Parent action not found.')
  return created(await postComment(ctx, await readJson(req, commentSchema)))
}
