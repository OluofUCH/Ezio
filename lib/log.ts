type Level = 'info' | 'warn' | 'error'

/**
 * Structured application log.
 *
 * JSON in production so Vercel's log search can filter on fields; readable in
 * development where a human is scanning a terminal. Never include request bodies,
 * cookies, tokens, PINs or answer keys.
 */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  }

  const line = process.env.NODE_ENV === 'production' ? JSON.stringify(entry) : `[${level}] ${event} ${JSON.stringify(fields)}`

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
