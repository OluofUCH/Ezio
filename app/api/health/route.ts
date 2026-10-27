import { NextResponse } from 'next/server'
import { route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Liveness/readiness probe for the deployment platform.
 *
 * Deliberately public and minimal: it proves the process can reach Postgres,
 * without exposing counts, tenant names or configuration.
 */
export const GET = route(async () => {
  const startedAt = Date.now()
  try {
    await unscopedDb.$queryRaw`SELECT 1`
    return NextResponse.json(
      {
        ok: true,
        data: {
          status: 'ok',
          time: new Date().toISOString(),
          database: 'up',
          latencyMs: Date.now() - startedAt,
        },
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Database unavailable.' },
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
})
