import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const fontPath = await realpath(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'))
const packagePath = await realpath(require.resolve('dejavu-fonts-ttf/package.json'))

for (const role of ['staff', 'student', 'parent']) {
  const trace = resolve(root, `.next/server/app/(sms)/api/sms/${role}/workspace/[area]/route.js.nft.json`)
  const { files } = JSON.parse(await readFile(trace, 'utf8'))
  const fontFiles = await Promise.all(files.filter(file => file.includes('dejavu-fonts-ttf')).map(file => realpath(resolve(dirname(trace), file))))
  assert(fontFiles.includes(fontPath), `The ${role} report PDF function is missing its Unicode font. Check outputFileTracingIncludes.`)
  assert(fontFiles.includes(packagePath), `The ${role} report PDF function is missing its font package metadata.`)
}

console.log('Report PDF bundle check passed: Unicode font and package metadata are included for staff, students and parents.')
