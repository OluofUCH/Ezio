import type { EnrollmentReason } from '@prisma/client'
import { conflict } from '@/lib/errors'
import type { SchoolTransaction } from '@/src/modules/shared/transaction'
import { assertCurrentPlacement, defaultArmFor, type PlacementStudent } from '@/src/modules/school-setup/rules'

/** No current session means this school has not activated SMS roster compatibility. */
export async function currentAcademicSetup(tx: SchoolTransaction) {
  const session = await tx.academicSession.findFirst({ where: { isCurrent: true } })
  if (!session) return null
  const arms = await tx.classArm.findMany({ where: { isDefault: true } })
  return { session, arms }
}

export async function ensureCurrentEnrollment(
  tx: SchoolTransaction,
  student: PlacementStudent,
  setup: NonNullable<Awaited<ReturnType<typeof currentAcademicSetup>>>,
  reason: EnrollmentReason,
) {
  const existing = await tx.enrollment.findFirst({
    where: { studentId: student.id, isCurrent: true },
    include: { classArm: true },
  })
  if (existing) {
    assertCurrentPlacement(student, setup.session, existing)
    return { enrollment: existing, created: false }
  }
  if (await tx.enrollment.count({ where: { studentId: student.id } })) {
    throw conflict('This student has enrollment history but no current placement. The backfill cannot reactivate them.')
  }
  const arm = defaultArmFor(setup.arms, student.schoolId, student.classLevel)
  const enrollment = await tx.enrollment.create({
    data: {
      schoolId: student.schoolId,
      studentId: student.id,
      academicSessionId: setup.session.id,
      classArmId: arm.id,
      sequence: 1,
      reason,
      isCurrent: true,
    },
    include: { classArm: true },
  })
  return { enrollment, created: true }
}
