import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { backfillConfigSchema } from '../src/modules/school-setup/backfill-config'

async function main() {
  const { values } = parseArgs({
    options: { config: { type: 'string' }, apply: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' } },
  })
  if (values.help) {
    console.log('pnpm sms:backfill --config <school-config.json> [--dry-run | --apply]\nDefaults to a read-only dry run. See docs/sms-phase-1.md. No migrations are applied by this script.')
    return
  }
  if (!values.config || (values.apply && values['dry-run'])) {
    throw new Error('Provide --config <file> and at most one of --apply or --dry-run.')
  }
  const config = backfillConfigSchema.parse(JSON.parse(await readFile(values.config, 'utf8')))
  const { tenantClient } = await import('../lib/tenant')
  const { applyBackfill, inspectBackfill } = await import('../src/modules/school-setup/backfill')
  const db = tenantClient(config.schoolId)
  try {
    const result = values.apply ? await applyBackfill(db, config) : await inspectBackfill(db, config)
    console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'dry-run', ...result }, null, 2))
    const verification = 'verification' in result ? result.verification : result
    if (verification.conflicts.length || (values.apply && (verification.enrollmentsToCreate || verification.examsToLink))) {
      process.exitCode = 1
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('SMS backfill stopped:', error instanceof Error ? error.message : 'Unknown error')
  console.error('Committed batches are retained. Review the dry run before retrying; existing history is never overwritten.')
  process.exitCode = 1
})
