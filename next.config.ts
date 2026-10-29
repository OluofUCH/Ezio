import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

/**
 * CSP is intentionally compatible with the current app: Next injects inline
 * bootstrap code, and fonts are loaded from Google Fonts. Tightening this to a
 * nonce-based policy requires moving font loading and the script bootstrap into
 * middleware, which is a separate change.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pnpm's cloud/LAN lockfiles must not make Next trace an unrelated parent project.
  outputFileTracingRoot: process.cwd(),

  // Avoid advertising the framework version.
  poweredByHeader: false,

  // SheetJS ships a CommonJS bundle that must not be traced/bundled by Turbopack
  // or webpack - leaving it external keeps `require` working inside the Node runtime.
  serverExternalPackages: ['xlsx', '@prisma/client', 'sharp', 'pdf-lib', '@pdf-lib/fontkit'],
  outputFileTracingIncludes: { '/api/sms/**': ['./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf'] },

  // Never leak stack traces or Prisma error internals to a client in production.
  // `lib/api.ts` handles the actual sanitising; this only stops the dev overlay
  // from being served in a production build.
  productionBrowserSourceMaps: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
