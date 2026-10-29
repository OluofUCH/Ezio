import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), {
    name: 'hall-only-modules',
    generateBundle() {
      for (const id of this.getModuleIds()) {
        const path = id.replaceAll('\\', '/').toLowerCase()
        if (/(?:^|\/)src\/modules\//.test(path) || path.includes('app/(sms)/') ||
            /(?:@prisma[+/]client|\.prisma\/client)/.test(path)) {
          this.error(`Cloud-only module in the hall web bundle: ${id}`)
        }
      }
    },
  }],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
