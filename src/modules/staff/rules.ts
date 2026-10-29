import type { UserRole } from '@/lib/core/domain'
import { conflict, notFound } from '@/lib/errors'

/** The caller resolves the record through the tenant client before checking eligibility. */
export function assertTeacherEligibility<T extends { role: UserRole; isActive: boolean }>(teacher: T | null, requireActive: boolean): T {
  if (!teacher || teacher.role !== 'TEACHER') throw notFound('Teacher not found.')
  if (requireActive && !teacher.isActive) throw conflict('Choose an active teacher for this assignment.')
  return teacher
}
