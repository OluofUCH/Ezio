import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/**
 * Compile the TypeScript server into one ESM file for the Windows installer.
 *
 * Prisma stays external: its generated client loads a query engine next to itself and
 * cannot be bundled safely. Everything else (Express, Zod, qrcode, the shared exam rules)
 * is compiled in, so the installed app does not need a TypeScript toolchain.
 */
const entry = fileURLToPath(new URL('../src/server.ts', import.meta.url))
const outfile = fileURLToPath(new URL('../dist/server/server.mjs', import.meta.url))
const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url))

await rm(fileURLToPath(new URL('../dist/server', import.meta.url)), { recursive: true, force: true })
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  tsconfig,
  external: ['@prisma/client', '@prisma/client/*', '.prisma/*', '@prisma/engines'],
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

console.log('Built dist/server/server.mjs')
