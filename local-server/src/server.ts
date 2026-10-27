import { createApp } from '@local/app'
import { pruneExpiredSessions } from '@local/auth/student'
import { ensureDataDir, isConfigured, readHallConfig, serverConfig } from '@local/config'
import { db, disconnect } from '@local/db'
import { applyMigrations } from '@local/db/migrate'
import { startAutoPush } from '@local/admin'
import { lanAddresses } from '@local/network'

/**
 * Start the hall server.
 *
 * Bound to 0.0.0.0, not localhost — the entire point is that other machines on the hall
 * network reach it. The LAN addresses are printed because that is the one piece of
 * information the invigilator has to type into thirty student devices, and hunting for it
 * with `ipconfig` while a room waits is a poor start to an exam.
 *
 * This process now starts even when nothing is paired or staged. Setup and admin are
 * loopback-only, so the localhost wizard can run on the same port as the student app
 * without exposing either to the hall network.
 */

async function main(): Promise<void> {
  ensureDataDir()
  // Upgrade an older hall database before any route opens the Prisma client. This
  // also creates the file on a fresh install, so the service never starts against
  // a missing or half-migrated schema.
  await applyMigrations()
  const { port } = serverConfig()

  const state = await db.syncState.findUnique({ where: { id: 'singleton' } }).catch(() => null)
  const config = readHallConfig()
  const configured = isConfigured()

  let examCount = 0
  let studentCount = 0
  let pending = 0
  let pruned = 0

  if (configured) {
    try {
      ;[examCount, studentCount, pending] = await Promise.all([
        db.exam.count(),
        db.student.count(),
        db.examSession.count({ where: { syncedAt: null, status: { not: 'IN_PROGRESS' } } }),
      ])
      pruned = await pruneExpiredSessions()
    } catch (error) {
      console.warn(
        `  Database is paired but not fully migrated: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const app = createApp()

  const server = app.listen(port, '0.0.0.0', () => {
    if (!configured) {
      console.log('\n  CBT Hall Server — setup required')
      console.log(`  Open http://localhost:${port}/setup on this computer to pair this hall.\n`)
    } else {
      console.log(`\n  CBT exam hall server — ${state?.schoolName ?? config?.schoolName ?? 'paired hall'}`)
      console.log(`  Device: ${state?.localServerName ?? config?.localServerName ?? 'this computer'}\n`)
      console.log(`  Staged: ${examCount} exam(s), ${studentCount} student(s) on the roster`)
      if (pending > 0) {
        console.log(`  ${pending} completed sitting(s) still awaiting upload to the cloud`)
      }
      if (pruned > 0) console.log(`  Cleared ${pruned} expired login(s)`)
    }

    console.log('\n  Student devices should open:')
    const addresses = lanAddresses()
    if (addresses.length === 0) {
      console.log(`    http://localhost:${port}   (no LAN address found — check this machine's network)`)
    } else {
      for (const address of addresses) console.log(`    http://${address}:${port}`)
    }

    console.log(`\n  Admin console (this machine only): http://localhost:${port}/admin`)
    console.log('  This server needs no internet during an exam. Press Ctrl+C to stop.\n')
  })

  const autoPush = startAutoPush()

  /**
   * Close the listener before disconnecting Prisma so an in-flight answer save completes
   * rather than failing. Mid-exam, a dropped autosave is a student's lost answer.
   */
  const shutdown = (signal: string) => {
    console.log(`\n  ${signal} received — finishing in-flight requests...`)
    clearInterval(autoPush)
    server.close(() => {
      void disconnect().then(() => {
        console.log('  Stopped. Push any unsynced results before wiping this machine.\n')
        process.exit(0)
      })
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch(async (error: unknown) => {
  console.error(`\n  Could not start: ${error instanceof Error ? error.message : String(error)}\n`)
  await disconnect()
  process.exitCode = 1
})
