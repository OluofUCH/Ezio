import type { Prisma } from '@prisma/client'
import { unscopedDb } from '@/lib/db'

export type AuditActorType = 'STAFF' | 'STUDENT' | 'DEVICE' | 'SYSTEM'

export type AuditInput = {
  schoolId?: string | null
  actorUserId?: string | null
  actorType: AuditActorType
  action: string
  targetType?: string | null
  targetId?: string | null
  ip?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Append a security/provisioning event.
 *
 * Audit writes are best-effort: a database blip must not turn a successful login
 * into a 500 after the session cookie has already been prepared. The failure is
 * still logged so it is visible to operators.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await unscopedDb.auditLog.create({
      data: {
        schoolId: input.schoolId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorType: input.actorType,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonObject) : undefined,
      },
    })
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'audit_write_failed',
        action: input.action,
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}
