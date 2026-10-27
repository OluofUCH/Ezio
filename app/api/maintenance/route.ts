import { NextResponse, type NextRequest } from 'next/server'
import { purgeExpiredThrottles } from '@/lib/auth/throttle'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Protected housekeeping endpoint for a platform cron.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. A normal request without
 * the secret gets 401 rather than a redirect so a misconfigured cron is obvious.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get('authorization')

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Maintenance authorization required.' } },
      { status: 401 },
    )
  }

  const throttles = await purgeExpiredThrottles()
  log('info', 'maintenance_completed', { throttlesPurged: throttles })

  return NextResponse.json({
    ok: true,
    data: { throttlesPurged: throttles, completedAt: new Date().toISOString() },
  })
}
