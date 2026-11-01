import type { StaffSession } from '@/lib/auth/session'
import type { PrismaClient } from '@prisma/client'
import { forbidden } from '@/lib/errors'

/** Platform reporting exposes aggregate counts, never a school's operational records. */
export async function platformDashboard(session: StaffSession, db: PrismaClient) {
  if (session.typ !== 'staff' || !session.userId || session.role !== 'SUPER_ADMIN') {
    throw forbidden('Platform administrator access required.')
  }
  const [schools, active, students, teachers] = await db.$transaction([
    db.school.count(),
    db.school.count({ where: { isActive: true } }),
    db.student.count(),
    db.user.count({ where: { role: 'TEACHER', schoolId: { not: null } } }),
  ], { isolationLevel: 'RepeatableRead' })
  return { totals: { schools, students, teachers }, schoolStatus: { active, paused: schools - active } }
}

export type PlatformDashboard = Awaited<ReturnType<typeof platformDashboard>>
