import { disconnect } from '@local/db'
import { applyMigrations } from '@local/db/migrate'
import { pullExam } from '@local/sync/pull'

/**
 * `npm run pull -- --exam=<examId>`
 *
 * Run before exam day, while the school still has internet.
 */

function examIdFromArgs(): string {
  const args = process.argv.slice(2)

  for (const arg of args) {
    if (arg.startsWith('--exam=')) return arg.slice('--exam='.length).trim()
  }
  const flagIndex = args.indexOf('--exam')
  if (flagIndex !== -1) {
    const value = args[flagIndex + 1]?.trim()
    if (value) return value
  }
  // A bare positional id, since that is what people type first.
  const positional = args.find((arg) => !arg.startsWith('-'))
  if (positional) return positional

  throw new Error(
    'Which exam? Usage: npm run pull -- --exam=<examId>\n' +
      '  Find the id in the teacher dashboard, or via GET /api/exams on the cloud.',
  )
}

async function main(): Promise<void> {
  await applyMigrations()
  const examId = examIdFromArgs()

  console.log(`\n  Staging exam ${examId} for offline use...`)

  const result = await pullExam(examId)

  console.log(`\n  Staged: "${result.exam.title}" (${result.exam.classLevel})`)
  console.log(`  ${result.questionCount} question(s), ${result.studentCount} student(s) on the roster`)

  /**
   * Clock drift is reported loudly because once offline, this machine's clock is the sole
   * authority on every exam deadline. A hall PC with a dead CMOS battery could hand out an
   * extra hour or cut students off early, and nobody would find out until the marks looked
   * wrong.
   */
  const drift = Math.abs(result.clockSkewSeconds)
  if (drift > 120) {
    console.log(
      `\n  WARNING: this machine's clock is ${result.clockSkewSeconds > 0 ? 'ahead of' : 'behind'} the cloud by ${drift}s.`,
    )
    console.log('  Exam timing is enforced from this clock once offline — fix it before exam day.')
  } else {
    console.log(`  Clock agrees with the cloud (${result.clockSkewSeconds}s difference).`)
  }

  console.log('\n  Next: `npm run serve` on exam day. No internet needed from here on.\n')
}

main()
  .catch((error: unknown) => {
    console.error(`\n  Pull failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(disconnect)
