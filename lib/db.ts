import { PrismaClient } from '@prisma/client'

/**
 * The raw, UNSCOPED Prisma client.
 *
 * Deliberately named `unscopedDb` rather than `prisma` so that every place
 * tenant isolation is bypassed is findable with a single grep. Application code
 * must use `tenantClient(schoolId)` from `lib/tenant.ts` instead.
 *
 * Legitimate call sites include:
 *
 *   1. `app/api/schools/**` and the platform dashboard: Super Admin onboarding,
 *      school status and aggregate platform reporting.
 *   2. `lib/auth/*` login lookups    A user must be found by email, and a student by
 *                                    (schoolSlug, regNumber), *before* their school is
 *                                    known — the scope doesn't exist yet at that point.
 *   3. `prisma/seed.ts`              Bootstrapping, runs outside any request.
 *
 * School operations must always use the authenticated tenant client.
 */

const globalForPrisma = globalThis as unknown as { unscopedDb?: PrismaClient }

export const unscopedDb =
  globalForPrisma.unscopedDb ??
  new PrismaClient({
    // Query logging in dev is how you notice a missing `schoolId` filter early.
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

// Next's dev server hot-reloads modules on every edit; without this the process
// accumulates a new connection pool per reload until Postgres refuses new clients.
if (process.env.NODE_ENV !== 'production') globalForPrisma.unscopedDb = unscopedDb

export type Db = PrismaClient
