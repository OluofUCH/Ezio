import { parseArgs } from 'node:util'
import { tenantClient } from '../lib/tenant'
import { idSchema } from '../lib/validation/common'

async function main() {
  const { values } = parseArgs({ options: { school: { type: 'string' }, apply: { type: 'boolean' } } })
  const schoolId = idSchema.parse(values.school)
  const db = tenantClient(schoolId)
  try {
    const missing = await db.assessmentComponent.count({ where: { isActive: null } })
    if (values.apply) await db.assessmentComponent.updateMany({ where: { isActive: null }, data: { isActive: true } })
    console.log(JSON.stringify({ schoolId, mode: values.apply ? 'apply' : 'dry-run', components: missing }))
  } finally { await db.$disconnect() }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
