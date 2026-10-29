import type { ClassLevel } from '@/lib/core/domain'
import type { TenantDb } from '@/lib/tenant'

export async function recordRosterGrant(db: TenantDb, schoolId: string, localServerId: string, examId: string, classLevel: ClassLevel, studentIds: string[]) {
  await db.$transaction(async (tx) => {
    await tx.offlineRosterGrant.createMany({ data: studentIds.map((studentId) => ({ schoolId, localServerId, examId, classLevel, studentId })), skipDuplicates: true })
    await tx.offlineRosterGrant.updateMany({ where: { localServerId, examId, studentId: { in: studentIds } }, data: { lastPulledAt: new Date() } })
  })
}

export async function wasEligibleOffline(db: TenantDb, localServerId: string, exam: { id: string; classLevel: ClassLevel; termId: string | null }, studentId: string, startedAt: Date) {
  if (await db.offlineRosterGrant.findFirst({ where: { localServerId, examId: exam.id, studentId, classLevel: exam.classLevel }, select: { id: true } })) return true
  const term = exam.termId ? await db.term.findFirst({ where: { id: exam.termId }, select: { academicSessionId: true } }) : null
  return Boolean(await db.enrollment.findFirst({ where: {
    studentId, status: 'ACTIVE', classArm: { level: exam.classLevel },
    ...(term ? { academicSessionId: term.academicSessionId } : {}),
    AND: [
      { OR: [{ effectiveFrom: { lte: startedAt } }, { reason: 'LEGACY_BACKFILL', academicSession: { startDate: { lte: startedAt }, endDate: { gte: startedAt } } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gt: startedAt } }] },
    ],
  }, select: { id: true } }))
}
