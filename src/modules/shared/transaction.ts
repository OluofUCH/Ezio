import type { TenantDb } from '@/lib/tenant'

// The callback inherits the tenant extension from db, including on retries.
export type SchoolTransaction = Omit<TenantDb, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

export async function schoolTransaction<T>(
  db: TenantDb,
  work: (tx: SchoolTransaction) => Promise<T>,
  timeout = 20_000,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: 'Serializable',
        maxWait: 5_000,
        timeout,
      })
    } catch (error) {
      // Serializable conflicts and concurrent insert races can safely retry the
      // entire transaction. Callbacks must contain database work only.
      const retryable = error instanceof Error && 'code' in error &&
        (error.code === 'P2034' || error.code === 'P2002')
      if (!retryable || attempt >= 2) throw error
    }
  }
}
