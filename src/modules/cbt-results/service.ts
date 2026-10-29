import { z } from 'zod'
import type { ScopedStaffContext } from '@/lib/auth/session'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { assertSubjectAccess, isSchoolAdmin, ownTerm } from '@/src/modules/shared/access'
import { schoolTransaction } from '@/src/modules/shared/transaction'
import { resultGroup, writeScoreCell } from '@/src/modules/results/service'
import { scaleCbt } from '@/src/modules/results/rules'

export const linkExamSchema = z.object({ examId: idSchema, subjectId: idSchema, termId: idSchema, componentId: idSchema.nullable().optional() }).strict()
export const importCbtSchema = z.object({ examId: idSchema, componentId: idSchema, attemptRule: z.enum(['BEST', 'LAST']) }).strict()

export async function linkExam(ctx: ScopedStaffContext, raw: z.infer<typeof linkExamSchema>) {
  const input = linkExamSchema.parse(raw)
  const term = await ownTerm(ctx.db, input.termId)
  const exam = await ctx.db.exam.findFirst({ where: { id: input.examId } })
  const subject = await ctx.db.subject.findFirst({ where: { id: input.subjectId } })
  if (!exam || !subject) throw notFound('Exam or subject not found.')
  if (!isSchoolAdmin(ctx.session.role) && !await ctx.db.teachingAssignment.findFirst({ where: { teacherId: ctx.session.userId, subjectId: subject.id, academicSessionId: term.academicSessionId, classArm: { level: exam.classLevel }, isActive: true } })) throw forbidden('This subject/class is not assigned to you.')
  if (input.componentId && !await ctx.db.assessmentComponent.findFirst({ where: { id: input.componentId } })) throw notFound('Component not found.')
  if (await ctx.db.score.count({ where: { examId: exam.id } })) throw conflict('An imported exam cannot be relinked. Use a new exam for a different term/subject.')
  return ctx.db.exam.update({ where: { id: exam.id }, data: { subjectId: subject.id, subject: subject.name, termId: term.id, componentId: input.componentId } })
}

export async function bridgeExams(ctx: ScopedStaffContext) {
  const exams = await ctx.db.exam.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, title: true, subject: true, classLevel: true, subjectId: true, termId: true, componentId: true, _count: { select: { examSessions: true } } } })
  if (isSchoolAdmin(ctx.session.role)) return exams
  const assigned = await ctx.db.teachingAssignment.findMany({ where: { teacherId: ctx.session.userId, isActive: true }, include: { classArm: true } })
  return exams.filter((exam) => assigned.some((a) => a.classArm.level === exam.classLevel && (!exam.subjectId || a.subjectId === exam.subjectId)))
}

export async function importCbtScores(ctx: ScopedStaffContext, raw: z.infer<typeof importCbtSchema>) {
  const input = importCbtSchema.parse(raw)
  const exam = await ctx.db.exam.findFirst({ where: { id: input.examId } })
  if (!exam || !exam.subjectId || !exam.termId) throw conflict('Link the exam to a subject and term before importing.')
  const term = await ownTerm(ctx.db, exam.termId)
  const total = (await ctx.db.question.aggregate({ where: { examId: exam.id }, _sum: { points: true } }))._sum.points ?? 0
  if (!total) throw conflict('The exam has no total points.')
  if (exam.endWindow && exam.endWindow > new Date()) throw conflict('Wait for the exam availability window to finish.')
  if (await ctx.db.examSession.count({ where: { examId: exam.id, status: 'IN_PROGRESS' } })) throw conflict('Finish or sweep open exam sittings before importing.')
  const sessions = await ctx.db.examSession.findMany({ where: { examId: exam.id, status: { in: ['SUBMITTED', 'AUTO_SUBMITTED', 'FLAGGED'] }, score: { not: null }, submittedAt: { not: null }, OR: [{ localServerId: null, localId: null }, { localServerId: { not: null }, syncedAt: { not: null } }] }, orderBy: [{ submittedAt: 'desc' }, { startedAt: 'desc' }, { id: 'asc' }] })
  const selected = new Map<string, typeof sessions[number]>()
  for (const sitting of sessions) {
    const old = selected.get(sitting.studentId)
    if (!old || input.attemptRule === 'BEST' && sitting.score! > old.score!) selected.set(sitting.studentId, sitting)
  }
  const report = { imported: 0, skipped: [] as { studentId: string; reason: string }[] }
  for (const sitting of selected.values()) {
    if (sitting.startedAt < term.startDate || sitting.startedAt.getTime() >= term.endDate.getTime() + 86400000) { report.skipped.push({ studentId: sitting.studentId, reason: 'Attempt is outside the linked term dates.' }); continue }
    if (sitting.maxScore !== total) { report.skipped.push({ studentId: sitting.studentId, reason: 'Historical denominator differs from the current exam total.' }); continue }
    const candidates = await ctx.db.enrollment.findMany({ where: { studentId: sitting.studentId, academicSessionId: term.academicSessionId, classArm: { level: exam.classLevel }, status: 'ACTIVE',
      AND: [{ OR: [{ effectiveFrom: { lte: sitting.startedAt } }, { reason: 'LEGACY_BACKFILL' }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gt: sitting.startedAt } }] }],
    }, orderBy: { sequence: 'desc' } })
    const enrollment = candidates[0]
    if (!enrollment) { report.skipped.push({ studentId: sitting.studentId, reason: 'No eligible enrollment in the target academic session.' }); continue }
    try { await assertSubjectAccess(ctx, enrollment.classArmId, exam.subjectId, term.academicSessionId) } catch { report.skipped.push({ studentId: sitting.studentId, reason: 'Class/subject not assigned to this teacher.' }); continue }
    const imported = await schoolTransaction(ctx.db, async (tx) => {
      const group = await resultGroup(ctx, tx, { classArmId: enrollment.classArmId, subjectId: exam.subjectId!, termId: term.id })
      if (['APPROVED', 'PUBLISHED'].includes(group.submission.status)) return false
      const component = group.components.find((c) => c.id === input.componentId)
      if (!component) throw conflict('The target component is not part of this term’s assessment policy.')
      const value = scaleCbt(sitting.score!, total, component.maxScore).toNumber()
      await writeScoreCell(tx, ctx, group, { enrollmentId: enrollment.id, componentId: component.id, value }, { source: 'CBT', examId: exam.id, sourceSessionId: sitting.id, sourceSyncVersion: sitting.syncVersion }, `CBT import: ${input.attemptRule}`)
      return true
    })
    if (imported) report.imported++
    else report.skipped.push({ studentId: sitting.studentId, reason: 'Submission is approved or published.' })
  }
  return report
}
