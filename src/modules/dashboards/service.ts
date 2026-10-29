import type { ScopedStaffContext } from '@/lib/auth/session'
import type { TenantDb } from '@/lib/tenant'
import { isSchoolAdmin } from '@/src/modules/shared/access'
import { attendanceTotals, studentAttendance } from '@/src/modules/attendance/service'
import { ownReports } from '@/src/modules/results/service'

export async function staffLookups(ctx: ScopedStaffContext) {
  const [sessions, arms, subjects, teachers, components, assignments] = await Promise.all([
    ctx.db.academicSession.findMany({ include: { terms: { orderBy: { orderIndex: 'asc' } } }, orderBy: { startDate: 'desc' } }),
    ctx.db.classArm.findMany({ where: isSchoolAdmin(ctx.session.role) ? {} : { OR: [{ formTeacherId: ctx.session.userId }, { teachingAssignments: { some: { teacherId: ctx.session.userId, isActive: true } } }] }, orderBy: [{ level: 'asc' }, { name: 'asc' }] }),
    ctx.db.subject.findMany({ where: isSchoolAdmin(ctx.session.role) ? {} : { teachingAssignments: { some: { teacherId: ctx.session.userId, isActive: true } } }, orderBy: { name: 'asc' } }),
    ctx.db.user.findMany({ where: { role: 'TEACHER', ...(isSchoolAdmin(ctx.session.role) ? {} : { id: ctx.session.userId }) }, select: { id: true, fullName: true, isActive: true }, orderBy: { fullName: 'asc' } }),
    ctx.db.assessmentComponent.findMany({ where: { OR: [{ isActive: true }, { isActive: null }] }, orderBy: { orderIndex: 'asc' }, select: { id: true, name: true, maxScore: true } }),
    ctx.db.teachingAssignment.findMany({ where: { isActive: true, ...(isSchoolAdmin(ctx.session.role) ? {} : { teacherId: ctx.session.userId }) }, select: { classArmId: true, subjectId: true, academicSessionId: true } }),
  ])
  return { sessions, arms, subjects, teachers, components, assignments }
}

export async function staffDashboard(ctx: ScopedStaffContext) {
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true } })
  const today = new Date().toISOString().slice(0, 10)
  const term = session ? await ctx.db.term.findFirst({ where: { academicSessionId: session.id, startDate: { lte: new Date(today) }, endDate: { gte: new Date(today) } } }) : null
  const assignments = await ctx.db.teachingAssignment.findMany({ where: { isActive: true, ...(session ? { academicSessionId: session.id } : {}), ...(isSchoolAdmin(ctx.session.role) ? {} : { teacherId: ctx.session.userId }) }, include: { teacher: { select: { id: true, fullName: true, isActive: true } }, subject: true, classArm: true } })
  const groups = term ? await ctx.db.resultSubmission.findMany({ where: { termId: term.id } }) : []
  const work = assignments.map((a) => ({ id: a.id, teacher: a.teacher, subject: a.subject.name, classArm: `${a.classArm.level} ${a.classArm.name}`, classArmId: a.classArmId, subjectId: a.subjectId, status: groups.find((g) => g.classArmId === a.classArmId && g.subjectId === a.subjectId)?.status ?? 'DRAFT' }))
  const formArms = await ctx.db.classArm.findMany({ where: isSchoolAdmin(ctx.session.role) ? {} : { formTeacherId: ctx.session.userId }, select: { id: true, level: true, name: true } })
  const marks = term ? await ctx.db.attendance.findMany({ where: { termId: term.id, ...(isSchoolAdmin(ctx.session.role) ? {} : { enrollment: { classArmId: { in: formArms.map((a) => a.id) } } }) }, select: { status: true } }) : []
  const counts = isSchoolAdmin(ctx.session.role) ? await ctx.db.enrollment.groupBy({ by: ['classArmId'], where: { isCurrent: true, status: 'ACTIVE', ...(session ? { academicSessionId: session.id } : {}) }, _count: { _all: true } }) : []
  return { session, term, date: today, attendance: attendanceTotals(marks), enrollmentCounts: counts.map((row) => ({ arm: formArms.find((a) => a.id === row.classArmId), count: row._count._all })), work,
    teacherProgress: [...new Set(work.map((w) => w.teacher.id))].map((id) => ({ teacher: work.find((w) => w.teacher.id === id)!.teacher, expected: work.filter((w) => w.teacher.id === id).length, submitted: work.filter((w) => w.teacher.id === id && w.status !== 'DRAFT').length, approved: work.filter((w) => w.teacher.id === id && ['APPROVED', 'PUBLISHED'].includes(w.status)).length })), formArms }
}

export async function studentDashboard(db: TenantDb, studentId: string) {
  const [reports, attendance, enrollment] = await Promise.all([
    ownReports(db, studentId), studentAttendance(db, studentId),
    db.enrollment.findFirst({ where: { studentId, isCurrent: true }, include: { classArm: true, academicSession: true } }),
  ])
  return { reports, attendance, enrollment }
}
