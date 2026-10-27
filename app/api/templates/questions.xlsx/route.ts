import { NextResponse } from 'next/server'
import { route } from '@/lib/api'
import { requireStaff } from '@/lib/auth/session'
import { buildQuestionTemplate } from '@/lib/import/templates'

export const runtime = 'nodejs'

/**
 * GET /api/templates/questions.xlsx — the fixed upload template (PRD §4.2a).
 *
 * Generated on request from the same header constants the parser validates against,
 * so the template and the rules it has to satisfy cannot drift apart. Nothing is
 * committed to the repository, which also keeps a binary out of code review.
 *
 * Staff-only. Not secret, but there is no reason for it to be a public endpoint.
 */
export const GET = route(async (req) => {
  await requireStaff(req)

  const workbook = buildQuestionTemplate()

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="cbt-question-template.xlsx"',
      'content-length': String(workbook.byteLength),
      // Regenerated per request and cheap; caching would only serve a stale template
      // after the columns change.
      'cache-control': 'no-store',
    },
  })
})
