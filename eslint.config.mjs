import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.next/**',
      'local-server/generated/**',
      'packaging/windows/stage/**',
      'packaging/windows/cache/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // The hall UI is Vite/React, not Next.js; ordinary links/images are required.
    files: ['local-server/**/*.{ts,tsx,js,mjs,cjs}'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-img-element': 'off',
      'no-restricted-imports': ['error', {
        patterns: ['@/src/modules/**', '**/src/modules/**', '@/app/(sms)/**', '**/app/(sms)/**', '@prisma/client', '@/lib/db', '@/lib/tenant'],
      }],
    },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@/lib/db', '**/lib/db'], message: 'Use the authenticated tenant client; SMS services cannot import the unscoped database.' }],
      }],
    },
  },
]

export default config
