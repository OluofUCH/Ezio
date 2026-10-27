import { PrismaClient } from '@prisma/client'
import { databaseUrl, ensureDataDir } from '@local/config'

/**
 * The LocalServer's own Prisma client, bound to the SQLite file in `.env`.
 *
 * Resolves to `local-server/node_modules/@prisma/client` — the client generated from
 * `local-server/prisma/schema.prisma`, NOT the cloud's Postgres client. The two packages
 * happen to share a name, which is exactly why nothing under `../lib` that this server
 * imports may reference `@prisma/client` at runtime: from here that specifier means the
 * SQLite client, whose generated types are different (no enums, JSON as text). The
 * portable modules in `../lib/core` exist to keep that boundary honest.
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
