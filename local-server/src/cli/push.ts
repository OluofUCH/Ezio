import { disconnect } from '@local/db'
import { applyMigrations } from '@local/db/migrate'
import { sweepExpired } from '@local/exam/engine'
import { pushResults } from '@local/sync/push'

/**
 * `npm run push`
 *
 * Run once internet is back (PRD §3.4 step 5). Safe to run repeatedly — the cloud keys on
 * (localServerId, localId), so anything it already holds comes back as ALREADY_SYNCED.
 */

async function main(): Promise<void> {
  await applyMigrations()

  /**
   * Sweep first, always.
   *
   * An IN_PROGRESS session is never pushed — pushing an unfinished sitting would consume a
   * cloud attempt for a paper that was never submitted. But a student whose machine was
   * switched off mid-exam leaves exactly that, and without this sweep their work would sit
   * on this device forever, invisible to the school. Closing them here is what gets those
   * marks uploaded.
   */
  const swept = await sweepExpired()
  if (swept.swept > 0) {
    console.log(`\n  Closed ${swept.swept} abandoned sitting(s) whose time had expired.`)
  }
  if (swept.stillRunning > 0) {
    console.log(`  ${swept.stillRunning} session(s) are still within their exam time and were left open.`)
    console.log('  Re-run this once the exam has finished to upload them.')
  }

  console.log('\n  Uploading results to the cloud...')

  const summary = await pushResults()

  if (summary.attempted === 0) {
    console.log('\n  Nothing to upload — every completed sitting is already synced.\n')
    return
  }

  console.log(`\n  ${summary.attempted} sitting(s) sent:`)
  console.log(`    created:        ${summary.created}`)
  if (summary.updated > 0) console.log(`    updated:        ${summary.updated}`)
  console.log(`    already synced: ${summary.alreadySynced}`)

  if (summary.rejected.length > 0) {
    /**
     * Rejections are left unsynced on this machine deliberately — the cloud gave a reason
     * that retrying will not change (a stale paper, a class mismatch), so the data stays put
     * for a human rather than being quietly marked done and lost.
     */
    console.log(`\n  ${summary.rejected.length} sitting(s) were REFUSED by the cloud and remain on this machine:`)
    for (const rejection of summary.rejected) {
      console.log(`    ${rejection.localId}: ${rejection.reason}`)
    }
    console.log('\n  These need a person to look at them. Re-running will not change the outcome.')
    process.exitCode = 1
    return
  }

  console.log('\n  All results are in the cloud. Safe to clear this machine if you need to.\n')
}

main()
  .catch((error: unknown) => {
    console.error(`\n  Push failed: ${error instanceof Error ? error.message : String(error)}\n`)
    console.error('  Nothing was lost — results stay on this machine until a push succeeds.\n')
    process.exitCode = 1
  })
  .finally(disconnect)
