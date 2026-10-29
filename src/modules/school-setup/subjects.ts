import type { SchoolTransaction } from '@/src/modules/shared/transaction'
import { subjectIdentity } from './rules'

/** Called inside a scoped transaction; a concurrent first insert retries the transaction. */
export async function ensureSubject(tx: SchoolTransaction, schoolId: string, label: string) {
  const identity = subjectIdentity(label)
  const existing = await tx.subject.findFirst({ where: { normalizedName: identity.normalizedName } })
  if (existing) return existing
  return tx.subject.create({ data: { schoolId, ...identity } })
}
