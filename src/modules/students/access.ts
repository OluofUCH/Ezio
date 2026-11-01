import type { ScopedStaffContext } from '@/lib/auth/session'
import { forbidden } from '@/lib/errors'
import { assertStaffScope } from '@/src/modules/shared/authorization'
import type { SchoolTransaction } from '@/src/modules/shared/transaction'

/** Null means school-wide admission; teachers receive only their live form-arm IDs. */
export async function admissionArmIds(ctx: ScopedStaffContext, db: Pick<SchoolTransaction, 'user'> = ctx.db): Promise<Set<string> | null> {
  assertStaffScope(ctx)
  if (ctx.session.role === 'SCHOOL_ADMIN') return null
  const teacher = await db.user.findFirst({ where: {
    id: ctx.session.userId, role: 'TEACHER', isActive: true, school: { isActive: true },
  }, select: { formTeacherArms: { select: { id: true } } } })
  if (!teacher?.formTeacherArms.length) throw forbidden('Only a school administrator or an assigned form teacher can admit students.')
  return new Set(teacher.formTeacherArms.map(arm => arm.id))
}

export function assertAdmissionArm(allowed: Set<string> | null, armId: string) {
  if (allowed && !allowed.has(armId)) throw forbidden('You can admit students only into your assigned form class arms.')
}
