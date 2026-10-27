/**
 * Next.js instrumentation hook. Runs once when the server process starts, before
 * any route handles traffic.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { validateEnv } = await import('@/lib/env')
  validateEnv()
}
