import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { ScopedStaffContext } from '@/lib/auth/session'
import type { TenantDb } from '@/lib/tenant'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { assertArmAccess, assertSubjectAccess, isSchoolAdmin, ownTerm, rosterAt } from '@/src/modules/shared/access'
import { schoolTransaction, type SchoolTransaction } from '@/src/modules/shared/transaction'
import { assessmentSchema, bandSchema, componentSchema, gradeFor, money, rankedTotals, type Component } from './rules'

export const groupSchema = z.object({ classArmId: idSchema, subjectId: idSchema, termId: idSchema }).strict()
export const scoreInputSchema = groupSchema.extend({ entries: z.array(z.object({ enrollmentId: idSchema, componentId: idSchema, value: z.coerce.number().finite().min(0).max(100) }).strict()).min(1).max(2000), reason: z.string().trim().max(500).default('') }).strict()
export const transitionResultSchema = z.object({ submissionId: idSchema, action: z.enum(['SUBMIT', 'APPROVE']) }).strict()
export const publishSchema = z.object({ classArmId: idSchema, termId: idSchema }).strict()
export const remarkSchema = z.object({ reportId: idSchema, teacherRemark: z.string().trim().max(1000).optional(), principalRemark: z.string().trim().max(1000).optional() }).strict()
const componentArray = z.array(componentSchema.extend({ id: z.string() }))
const activeComponents = { OR: [{ isActive: true }, { isActive: null }] }
const policyValues = (policy: { components: unknown; gradeBands: unknown }) => ({ components: componentArray.parse(policy.components), bands: z.array(bandSchema).parse(policy.gradeBands) })

export async function assessmentSettings(ctx: ScopedStaffContext) {
  assertSchoolAdministrator(ctx)
  return readConfiguration(ctx.db)
}
async function readConfiguration(db: Pick<SchoolTransaction, 'assessmentComponent' | 'gradeBand'>) {
  const [components, bands] = await Promise.all([
    db.assessmentComponent.findMany({ where: activeComponents, orderBy: { orderIndex: 'asc' } }),
    db.gradeBand.findMany({ where: { isActive: true }, orderBy: { minScore: 'asc' } }),
  ])
  return { components: components.map((c) => ({ id: c.id, name: c.name, maxScore: Number(c.maxScore), orderIndex: c.orderIndex })), bands: bands.map((b) => ({ minScore: Number(b.minScore), maxScore: Number(b.maxScore), grade: b.grade, remark: b.remark })) }
}

export async function saveAssessment(ctx: ScopedStaffContext, raw: z.infer<typeof assessmentSchema>) {
  assertSchoolAdministrator(ctx)
  const input = assessmentSchema.parse(raw)
  return schoolTransaction(ctx.db, async (tx) => {
    await tx.assessmentComponent.updateMany({ data: { isActive: false } })
    for (const [index, component] of input.components.entries()) {
      const existing = await tx.assessmentComponent.findFirst({ where: { name: { equals: component.name, mode: 'insensitive' } } })
      if (existing) await tx.assessmentComponent.update({ where: { id: existing.id }, data: { maxScore: component.maxScore, orderIndex: index, isActive: true } })
      else await tx.assessmentComponent.create({ data: { schoolId: ctx.schoolId, name: component.name, maxScore: component.maxScore, orderIndex: index, isActive: true } })
    }
    await tx.gradeBand.updateMany({ where: { isActive: true }, data: { isActive: false } })
    await tx.gradeBand.createMany({ data: input.bands.map((band) => ({ schoolId: ctx.schoolId, ...band })) })
    return readConfiguration(tx)
  })
}

async function policyFor(tx: SchoolTransaction, schoolId: string, termId: string) {
  const existing = await tx.termResultPolicy.findFirst({ where: { termId } })
  if (existing) return existing
  const config = await readConfiguration(tx)
  assessmentSchema.parse(config)
  return tx.termResultPolicy.create({ data: { schoolId, termId, components: config.components, gradeBands: config.bands } })
}

export async function resultGroup(ctx: ScopedStaffContext, tx: SchoolTransaction, input: z.infer<typeof groupSchema>) {
  const term = await ownTerm(tx, input.termId)
  await assertSubjectAccess(ctx, input.classArmId, input.subjectId, term.academicSessionId, tx)
  const assignment = await tx.teachingAssignment.findFirst({ where: { classArmId: input.classArmId, subjectId: input.subjectId, academicSessionId: term.academicSessionId, isActive: true }, select: { id: true } })
  if (!assignment) throw conflict('Assign this subject to the class arm for this session first.')
  let submission = await tx.resultSubmission.findFirst({ where: input, include: { policy: true } })
  if (!submission) {
    const policy = await policyFor(tx, ctx.schoolId, input.termId)
    submission = await tx.resultSubmission.create({ data: { schoolId: ctx.schoolId, ...input, policyId: policy.id }, include: { policy: true } })
  }
  // All score writes and transitions acquire the same parent-row write lock.
  await tx.resultSubmission.update({ where: { id: submission.id }, data: { updatedAt: new Date() } })
  return { submission, term, ...policyValues(submission.policy) }
}

export async function scoreSheet(ctx: ScopedStaffContext, raw: z.infer<typeof groupSchema>) {
  const input = groupSchema.parse(raw)
  const term = await ownTerm(ctx.db, input.termId)
  await assertSubjectAccess(ctx, input.classArmId, input.subjectId, term.academicSessionId)
  const [arm, subject] = await Promise.all([ctx.db.classArm.findFirst({ where: { id: input.classArmId } }), ctx.db.subject.findFirst({ where: { id: input.subjectId } })])
  if (!arm || !subject) throw notFound('Class arm or subject not found.')
  const submission = await ctx.db.resultSubmission.findFirst({ where: input, include: { policy: true } })
  const policy = submission ? policyValues(submission.policy) : await readConfiguration(ctx.db)
  const roster = await rosterAt(ctx.db, term.academicSessionId, term.endDate, arm.id)
  const scores = submission ? await ctx.db.score.findMany({ where: { submissionId: submission.id } }) : []
  return { term, arm, subject, ...policy, roster, scores, submission: submission ? { id: submission.id, status: submission.status } : null,
    editable: isSchoolAdmin(ctx.session.role) || !submission || ['DRAFT', 'SUBMITTED'].includes(submission.status) }
}

export async function writeScoreCell(tx: SchoolTransaction, ctx: ScopedStaffContext, group: Awaited<ReturnType<typeof resultGroup>>, cell: { enrollmentId: string; componentId: string; value: number }, provenance: { source: 'MANUAL' | 'CBT'; examId?: string; sourceSessionId?: string; sourceSyncVersion?: number }, reason: string) {
  const component = group.components.find((c) => c.id === cell.componentId)
  if (!component || money(cell.value).lt(0) || money(cell.value).gt(component.maxScore)) throw conflict('Score is outside the component maximum in this term’s policy.')
  const enrollment = await tx.enrollment.findFirst({ where: { id: cell.enrollmentId, classArmId: group.submission.classArmId, academicSessionId: group.term.academicSessionId } })
  if (!enrollment) throw notFound('Enrollment does not belong to this class and session.')
  const existing = await tx.score.findFirst({ where: { submissionId: group.submission.id, enrollmentId: cell.enrollmentId, componentId: cell.componentId } })
  const value = money(cell.value).toFixed(2)
  if (existing && Number(existing.value) === Number(value) && existing.source === provenance.source && (provenance.source !== 'CBT' || existing.sourceSessionId === provenance.sourceSessionId && existing.sourceSyncVersion === provenance.sourceSyncVersion)) return existing
  const data = { value, ...provenance, updatedById: ctx.session.userId }
  const score = existing ? await tx.score.update({ where: { id: existing.id }, data }) : await tx.score.create({ data: {
    schoolId: ctx.schoolId, enrollmentId: cell.enrollmentId, componentId: cell.componentId,
    termId: group.term.id, subjectId: group.submission.subjectId, submissionId: group.submission.id, ...data,
  } })
  await tx.scoreAuditLog.create({ data: { schoolId: ctx.schoolId, scoreId: score.id, actorUserId: ctx.session.userId, oldValue: existing?.value, newValue: value, oldSource: existing?.source, newSource: provenance.source, reason } })
  return score
}

export async function saveScores(ctx: ScopedStaffContext, raw: z.infer<typeof scoreInputSchema>) {
  const input = scoreInputSchema.parse(raw)
  if (new Set(input.entries.map((e) => `${e.enrollmentId}:${e.componentId}`)).size !== input.entries.length) throw conflict('Duplicate score cells.')
  return schoolTransaction(ctx.db, async (tx) => {
    const group = await resultGroup(ctx, tx, { classArmId: input.classArmId, subjectId: input.subjectId, termId: input.termId })
    const locked = ['APPROVED', 'PUBLISHED'].includes(group.submission.status)
    if (locked && !isSchoolAdmin(ctx.session.role)) throw forbidden('Approved scores are locked. Contact a school administrator.')
    if (locked && input.reason.length < 3) throw conflict('Provide a reason for an approved-score correction.')
    const roster = await rosterAt(tx, group.term.academicSessionId, group.term.endDate, input.classArmId)
    for (const cell of input.entries) {
      if (!locked && !roster.some((e) => e.id === cell.enrollmentId)) throw notFound('Enrollment is outside the term roster.')
      await writeScoreCell(tx, ctx, group, cell, { source: 'MANUAL' }, input.reason || 'Manual score entry')
    }
    if (locked) await refreshReports(tx, ctx.schoolId, input.classArmId, group.term.id)
    return { saved: input.entries.length }
  }, 60_000)
}

function completeMarks(enrollmentId: string, scores: { enrollmentId: string; componentId: string; value: Prisma.Decimal }[], components: Component[]) {
  return components.every((component) => scores.some((score) => score.enrollmentId === enrollmentId && score.componentId === component.id))
}

export async function transitionResults(ctx: ScopedStaffContext, raw: z.infer<typeof transitionResultSchema>) {
  const input = transitionResultSchema.parse(raw)
  if (input.action === 'APPROVE') assertSchoolAdministrator(ctx)
  return schoolTransaction(ctx.db, async (tx) => {
    const existing = await tx.resultSubmission.findFirst({ where: { id: input.submissionId } })
    if (!existing) throw notFound('Submission not found.')
    const group = await resultGroup(ctx, tx, { classArmId: existing.classArmId, subjectId: existing.subjectId, termId: existing.termId })
    const expected = input.action === 'SUBMIT' ? 'DRAFT' : 'SUBMITTED'
    if (group.submission.status !== expected) throw conflict(`This action requires ${expected} status.`)
    const roster = await rosterAt(tx, group.term.academicSessionId, group.term.endDate, existing.classArmId)
    const scores = await tx.score.findMany({ where: { submissionId: existing.id } })
    if (!roster.length || roster.some((e) => !completeMarks(e.id, scores, group.components))) throw conflict('Enter every component for every enrolled student before submitting or approving.')
    const updated = await tx.resultSubmission.update({ where: { id: existing.id }, data: input.action === 'SUBMIT'
      ? { status: 'SUBMITTED', submittedById: ctx.session.userId, submittedAt: new Date() }
      : { status: 'APPROVED', approvedById: ctx.session.userId, approvedAt: new Date() } })
    const reports = input.action === 'APPROVE' ? await refreshReports(tx, ctx.schoolId, existing.classArmId, existing.termId) : { ready: false }
    return { submission: updated, reports }
  }, 60_000)
}

export type ReportSnapshot = { school: string; student: string; admissionNumber: string; className: string; session: string; term: string; subjects: { id: string; name: string; total: number; grade: string; remark: string; components: { id: string; name: string; maxScore: number; value: number; source: string }[] }[] }

export async function refreshReports(tx: SchoolTransaction, schoolId: string, classArmId: string, termId: string) {
  const term = await ownTerm(tx, termId)
  const [arm, school, prior, assignments] = await Promise.all([
    tx.classArm.findFirst({ where: { id: classArmId } }), tx.school.findFirst({ select: { name: true } }),
    tx.reportCard.findMany({ where: { classArmId, termId }, include: { enrollment: { include: { student: true, classArm: true } } } }),
    tx.teachingAssignment.findMany({ where: { classArmId, academicSessionId: term.academicSessionId, isActive: true }, select: { subjectId: true } }),
  ])
  if (!arm || !school) throw notFound('Class or school not found.')
  const historical = prior[0]?.snapshot as ReportSnapshot | undefined
  const subjectIds = historical?.subjects.map((s) => s.id) ?? [...new Set(assignments.map((a) => a.subjectId))]
  if (!subjectIds.length) throw conflict('The class has no assigned subjects.')
  const groups = await tx.resultSubmission.findMany({ where: { classArmId, termId, subjectId: { in: subjectIds } }, include: { policy: true, subject: true, scores: true } })
  if (groups.length !== subjectIds.length || groups.some((g) => !['APPROVED', 'PUBLISHED'].includes(g.status))) return { ready: false, count: 0 }
  const current = await rosterAt(tx, term.academicSessionId, term.endDate, classArmId)
  const roster = [...prior.map((r) => r.enrollment), ...current.filter((e) => !prior.some((r) => r.enrollment.studentId === e.studentId))]
  const prepared: { id: string; totals: number[]; snapshot: ReportSnapshot }[] = []
  for (const enrollment of roster) {
    const subjects: ReportSnapshot['subjects'] = []
    for (const group of groups) {
      const policy = policyValues(group.policy)
      if (!completeMarks(enrollment.id, group.scores, policy.components)) continue
      const components = policy.components.map((c) => { const score = group.scores.find((s) => s.enrollmentId === enrollment.id && s.componentId === c.id)!; return { ...c, value: Number(score.value), source: score.source } })
      const total = money(components.reduce((sum, c) => sum + c.value, 0)).toNumber()
      subjects.push({ id: group.subjectId, name: group.subject.name, total, ...gradeFor(total, policy.bands), components })
    }
    if (subjects.length !== groups.length) {
      if (!prior.length || prior.some((r) => r.enrollmentId === enrollment.id)) throw conflict('All required subjects must contain complete marks before report approval.')
      continue
    }
    prepared.push({ id: enrollment.id, totals: subjects.map((s) => s.total), snapshot: { school: school.name, student: enrollment.student.fullName, admissionNumber: enrollment.student.regNumber, className: `${arm.level} ${arm.name}`, session: term.academicSession.name, term: term.name, subjects } })
  }
  if (!prepared.length) throw conflict('There are no complete student results to approve.')
  for (const row of rankedTotals(prepared)) {
    const data = { total: row.total.toFixed(2), average: row.average.toFixed(2), position: row.position, subjectCount: row.totals.length, snapshot: row.snapshot as unknown as Prisma.InputJsonValue }
    await tx.reportCard.upsert({ where: { schoolId_enrollmentId_termId: { schoolId, enrollmentId: row.id, termId } },
      create: { schoolId, enrollmentId: row.id, classArmId, termId, ...data }, update: { ...data, revision: { increment: 1 } },
    })
  }
  return { ready: true, count: prepared.length }
}

export async function publishReports(ctx: ScopedStaffContext, raw: z.infer<typeof publishSchema>) {
  assertSchoolAdministrator(ctx)
  const input = publishSchema.parse(raw)
  return schoolTransaction(ctx.db, async (tx) => {
    const outcome = await refreshReports(tx, ctx.schoolId, input.classArmId, input.termId)
    if (!outcome.ready) throw conflict('Approve every required subject before publication.')
    await tx.resultSubmission.updateMany({ where: { ...input, status: 'APPROVED' }, data: { status: 'PUBLISHED', publishedById: ctx.session.userId, publishedAt: new Date() } })
    await tx.reportCard.updateMany({ where: input, data: { status: 'PUBLISHED', publishedAt: new Date() } })
    return outcome
  }, 60_000)
}

export async function listReports(ctx: ScopedStaffContext, classArmId: string, termId: string) {
  const term = await ownTerm(ctx.db, termId)
  await assertArmAccess(ctx, classArmId, term.academicSessionId)
  return ctx.db.reportCard.findMany({ where: { classArmId, termId }, orderBy: [{ position: 'asc' }, { id: 'asc' }] })
}
export async function ownReports(db: TenantDb, studentId: string) {
  return db.reportCard.findMany({ where: { status: 'PUBLISHED', enrollment: { studentId } }, orderBy: { approvedAt: 'desc' } })
}
export async function saveRemarks(ctx: ScopedStaffContext, raw: z.infer<typeof remarkSchema>) {
  const input = remarkSchema.parse(raw)
  const report = await ctx.db.reportCard.findFirst({ where: { id: input.reportId } })
  if (!report) throw notFound('Report card not found.')
  await assertArmAccess(ctx, report.classArmId, undefined, true)
  if (!isSchoolAdmin(ctx.session.role) && (input.principalRemark !== undefined || report.status === 'PUBLISHED')) throw forbidden('Only an administrator can edit principal remarks or published reports.')
  return ctx.db.reportCard.update({ where: { id: report.id }, data: { teacherRemark: input.teacherRemark, principalRemark: input.principalRemark, revision: { increment: 1 } } })
}
