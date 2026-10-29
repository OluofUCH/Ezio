import { rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/**
 * Compile the TypeScript server into one ESM file for the Windows installer.
 *
 * The private SQLite client stays external: it loads a query engine next to itself and
 * cannot be bundled safely. Everything else (Express, Zod, qrcode, the shared exam rules)
 * is compiled in, so the installed app does not need a TypeScript toolchain.
 */
const entry = fileURLToPath(new URL('../src/server.ts', import.meta.url))
const outfile = fileURLToPath(new URL('../dist/server/server.mjs', import.meta.url))
const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url))

await rm(fileURLToPath(new URL('../dist/server', import.meta.url)), { recursive: true, force: true })
const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  metafile: true,
  tsconfig,
  external: ['#local-prisma'],
  banner: {
    js: [
      "import { createRequire as __cbtCreateRequire } from 'node:module';",
      'const require = __cbtCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

const forbidden = Object.keys(result.metafile.inputs).filter((input) => {
  const path = input.replaceAll('\\', '/').toLowerCase()
  return /(?:^|\/)src\/modules\//.test(path) ||
    path.includes('app/(sms)/') || /(?:@prisma[+/]client|\.prisma\/client)/.test(path)
})
if (forbidden.length > 0) {
  throw new Error(`The hall bundle contains cloud-only modules: ${forbidden.join(', ')}`)
}
await writeFile(
  fileURLToPath(new URL('../dist/server/metafile.json', import.meta.url)),
  JSON.stringify(result.metafile, null, 2),
)

console.log('Built dist/server/server.mjs')
