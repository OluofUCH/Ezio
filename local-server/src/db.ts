import { PrismaClient } from '#local-prisma'
import { databaseUrl, ensureDataDir } from '@local/config'

/**
 * The LocalServer's own Prisma client, bound to the SQLite file in `.env`.
 *
 * `#local-prisma` resolves to this package's private generated SQLite client, both
 * from source and in the installer. Dependency-manager hoisting cannot substitute
 * the cloud's PostgreSQL client. Shared modules in `../lib/core` remain portable
 * and must not import either generated client at runtime.
 *
 * A single instance, unlike the cloud's hot-reload guard in lib/db.ts — this is a
 * long-lived process started once from the command line, so there is no reload cycle to
 * defend against.
 */
ensureDataDir()

export const db = new PrismaClient({
  datasourceUrl: databaseUrl(),
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

/** Close cleanly so SQLite's write-ahead log is checkpointed before the process exits. */
export async function disconnect(): Promise<void> {
  await db.$disconnect()
}
