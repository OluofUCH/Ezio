import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const root = new URL('../', import.meta.url)
const schema = await readFile(new URL('local-server/generated/client/schema.prisma', root), 'utf8')
assert.match(schema, /provider\s*=\s*"sqlite"/, 'The hall client must use SQLite.')
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]).sort()
assert.deepEqual(models, [
  'Answer', 'DeviceSession', 'Exam', 'ExamSession', 'Option', 'Question', 'Student', 'SyncState',
], 'The hall client must contain only the existing CBT models.')
const requireHall = createRequire(new URL('local-server/package.json', root))
const { Prisma } = requireHall('#local-prisma')
assert.deepEqual(Object.values(Prisma.ModelName).sort(), models,
  'Runtime package resolution must select the private SQLite client.')

const metadata = JSON.parse(await readFile(new URL('local-server/dist/server/metafile.json', root), 'utf8'))
for (const input of Object.keys(metadata.inputs)) {
  const path = input.replaceAll('\\', '/').toLowerCase()
  assert(!/(?:^|\/)src\/modules\//.test(path), `SMS module in hall bundle: ${path}`)
  assert(!path.includes('app/(sms)/'), `SMS route in hall bundle: ${path}`)
  assert(!/(?:@prisma[+/]client|\.prisma\/client)/.test(path), `Shared Prisma client in hall bundle: ${path}`)
}
const imports = Object.values(metadata.outputs).flatMap((output) => output.imports)
assert(imports.some((entry) => entry.path === '#local-prisma' && entry.external),
  'The hall bundle must resolve its private Prisma client at runtime.')
console.log('LAN boundary passed: CBT-only SQLite client and no SMS/cloud client in the server bundle.')
