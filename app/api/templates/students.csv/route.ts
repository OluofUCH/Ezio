import { NextResponse } from 'next/server'
import { route } from '@/lib/api'
import { requireStaff } from '@/lib/auth/session'
import { buildRosterTemplate } from '@/lib/import/templates'

export const runtime = 'nodejs'

/**
 * GET /api/templates/students.csv — the roster import template (PRD §3.1 step 3).
 *
 * Sample rows show both PIN modes: blank to auto-generate, or a value to set one
 * explicitly. Emitted with a UTF-8 BOM so Excel on Windows does not mangle accented
 * names when the admin opens it.
 */
export const GET = route(async (req) => {
  await requireStaff(req)

  const csv = buildRosterTemplate()

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="cbt-student-roster-template.csv"',
      'cache-control': 'no-store',
    },
  })
})
