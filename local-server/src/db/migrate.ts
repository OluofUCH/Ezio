import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '@local/db'

/**
 * Apply the SQLite migrations bundled next to the server.
 *
 * This is deliberately not `prisma migrate deploy`. The first pilot databases were
 * created with `prisma db push`, so they have a schema but no Prisma migration
 * history. Running the initial migration against one of those would fail on the
 * first `CREATE TABLE`. Instead this runner:
 *
 *   1. creates its own `_local_migrations` ledger,
 *   2. baselines an existing database at the initial migration without re-running it,
 *   3. applies every migration not yet in the ledger, each in a transaction.
 *
 * The migrations live at `prisma/migrations/<timestamp>_<name>/migration.sql`. That
 * folder is copied into the installed app by `packaging/windows/build.ps1`, and the
 * path below resolves from both `src/db` (development) and `dist/server/server.mjs`
 * (installed app) because both are two levels below the local-server root.
 */

const migrationsDir = fileURLToPath(new URL('../../prisma/migrations', import.meta.url))

type Migration = { id: string; sql: string }

/**
 * Split a migration script into statements.
 *
 * Prisma's `$executeRawUnsafe` runs only the first statement on SQLite, even when
 * handed several, so the script cannot be passed through whole. This splitter
 * ignores semicolons inside quoted identifiers, string literals and comments.
 * Triggers (`BEGIN ... END`) are not used by any current migration; if one is added,
 * this needs a body-aware rule before it can be applied.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let quote: "'" | '"' | '`' | ']' | null = null
  let index = 0

  while (index < sql.length) {
    const char = sql[index]!
    const next = sql[index + 1]

    if (quote) {
      current += char
      if (quote === ']') {
        if (char === ']') quote = null
      } else if (char === quote) {
        if (next === quote) {
          current += next
          index += 1
        } else {
          quote = null
        }
      }
      index += 1
      continue
    }

    if (char === '-' && next === '-') {
      const newline = sql.indexOf('\n', index)
      index = newline === -1 ? sql.length : newline + 1
      current += '\n'
      continue
    }

    if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2)
      index = end === -1 ? sql.length : end + 2
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      current += char
      index += 1
      continue
    }

    if (char === '[') {
      quote = ']'
      current += char
      index += 1
      continue
    }

    if (char === ';') {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      index += 1
      continue
    }

    current += char
    index += 1
  }

  const trailing = current.trim()
  if (trailing) statements.push(trailing)

  return statements
}

function loadMigrations(): Migration[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((id) => ({
      id,
      sql: readFileSync(join(migrationsDir, id, 'migration.sql'), 'utf8'),
    }))
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    name,
  )
  return rows.length > 0
}

async function appliedIds(): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "_local_migrations"')
  return new Set(rows.map((row) => row.id))
}

export async function applyMigrations(): Promise<void> {
  await db.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "_local_migrations" (' +
      '"id" TEXT NOT NULL PRIMARY KEY, ' +
      '"appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' +
      ')',
  )

  const migrations = loadMigrations()
  if (migrations.length === 0) return

  const applied = await appliedIds()

  /**
   * An existing `db push` database is already at the initial schema. Record the
   * baseline instead of replaying CREATE TABLE statements that would fail. Future
   * migrations are then applied normally.
   */
  if (applied.size === 0 && (await tableExists('SyncState'))) {
    const baseline = migrations[0]!
    await db.$executeRawUnsafe('INSERT INTO "_local_migrations" ("id") VALUES (?)', baseline.id)
    applied.add(baseline.id)
    console.log(`[db] Existing database baselined at ${baseline.id}`)
  }

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue

    console.log(`[db] Applying ${migration.id}`)
    const statements = splitSqlStatements(migration.sql)
    await db.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement)
      }
      await tx.$executeRawUnsafe('INSERT INTO "_local_migrations" ("id") VALUES (?)', migration.id)
    })
  }
}
