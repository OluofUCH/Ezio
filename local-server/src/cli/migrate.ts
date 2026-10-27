import { disconnect } from '@local/db'
import { applyMigrations } from '@local/db/migrate'

/**
 * `npm run migrate`
 *
 * Creates the SQLite database if needed, applies any pending migrations, and
 * baselines a database created by the older `prisma db push` setup.
 */

async function main(): Promise<void> {
  await applyMigrations()
  console.log('\n  Database schema is up to date.\n')
}

main()
  .catch((error: unknown) => {
    console.error(`\n  Migration failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(disconnect)
