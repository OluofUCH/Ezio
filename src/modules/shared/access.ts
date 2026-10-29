import type { ScopedStaffContext } from '@/lib/auth/session'
import { forbidden, notFound } from '@/lib/errors'
import type { SchoolTransaction } from './transaction'

export const isSchoolAdmin = (role: string) => role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN'
export type ScopedDb = Pick<SchoolTransaction, 'classArm' | 'teachingAssignment' | 'term' | 'enrollment'>

export async function ownTerm(db: ScopedDb, id: string) {
  const term = await db.term.findFirst({ where: { id }, include: { academicSession: true } })
  if (!term) throw notFound('Term not found.')
  return term
}

export async function assertArmAccess(context: ScopedStaffContext, armId: string, sessionId?: string, formOnly = false) {
  const arm = await context.db.classArm.findFirst({ where: { id: armId } })
  if (!arm) throw notFound('Class arm not found.')
  if (isSchoolAdmin(context.session.role)) return arm
  if (context.session.role !== 'TEACHER') throw forbidden('Staff access required.')
  if (arm.formTeacherId === context.session.userId) return arm
  if (!formOnly && await context.db.teachingAssignment.findFirst({ where: {
    teacherId: context.session.userId, classArmId: armId, academicSessionId: sessionId, isActive: true,
    teacher: { isActive: true, role: 'TEACHER' },
  }, select: { id: true } })) return arm
  throw forbidden(formOnly ? 'Only this arm’s form teacher can mark attendance.' : 'This class arm is not assigned to you.')
}

export async function assertSubjectAccess(context: ScopedStaffContext, armId: string, subjectId: string, sessionId: string, db: ScopedDb = context.db) {
  if (isSchoolAdmin(context.session.role)) return
  if (context.session.role !== 'TEACHER' || !await db.teachingAssignment.findFirst({ where: {
    teacherId: context.session.userId, classArmId: armId, subjectId, academicSessionId: sessionId, isActive: true,
    teacher: { isActive: true, role: 'TEACHER' },
  }, select: { id: true } })) throw forbidden('This subject and class arm are not assigned to you for this session.')
}

export function dayEnd(date: Date) { return new Date(date.getTime() + 86_400_000 - 1) }

/** The latest effective placement for each student, including a later withdrawal. */
export async function rosterAt(db: ScopedDb, sessionId: string, date: Date, armId?: string) {
  const rows = await db.enrollment.findMany({ where: {
    academicSessionId: sessionId, effectiveFrom: { lte: dayEnd(date) },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
  }, include: { student: { select: { id: true, regNumber: true, fullName: true, classLevel: true } }, classArm: true }, orderBy: [{ sequence: 'desc' }, { effectiveFrom: 'desc' }] })
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.studentId)) return false
    seen.add(row.studentId)
    return row.status === 'ACTIVE' && (!armId || row.classArmId === armId)
  })
}
