import type { Prisma } from '@prisma/client'
import type { z } from 'zod'
import type { ScopedStaffContext } from '@/lib/auth/session'
import { forbidden, notFound } from '@/lib/errors'
import { assertStaffScope } from '@/src/modules/shared/authorization'
import { isSchoolAdmin, ownTerm, rosterAt } from '@/src/modules/shared/access'
import { schoolTransaction, type SchoolTransaction } from '@/src/modules/shared/transaction'
import { feeQuerySchema, feeRosterDate, feeStatusSchema } from './validation'

const feeSelect = { id: true, studentId: true, status: true, updatedAt: true, updatedBy: { select: { fullName: true } } } satisfies Prisma.StudentFeeSelect
const armSelect = { id: true, level: true, name: true, formTeacherId: true } satisfies Prisma.ClassArmSelect

function assertFeeStaff(ctx: ScopedStaffContext) {
  assertStaffScope(ctx)
  if (!isSchoolAdmin(ctx.session.role) && ctx.session.role !== 'TEACHER') throw forbidden('Staff access required.')
}

async function feeArm(ctx: ScopedStaffContext, db: SchoolTransaction, classArmId: string) {
  const arm = await db.classArm.findFirst({ where: { id: classArmId }, select: armSelect })
  if (!arm) throw notFound('Class arm not found.')
  if (!isSchoolAdmin(ctx.session.role) && arm.formTeacherId !== ctx.session.userId) throw forbidden('Only the class form teacher or a school administrator can manage these fees.')
  return arm
}

export async function feeRegister(ctx: ScopedStaffContext, raw: z.infer<typeof feeQuerySchema>) {
  assertFeeStaff(ctx)
  const input = feeQuerySchema.parse(raw)
  const term = await ownTerm(ctx.db, input.termId)
  if (input.classArmId) await feeArm(ctx, ctx.db, input.classArmId)
  const arms = await ctx.db.classArm.findMany({ where: {
    ...(input.classLevel ? { level: input.classLevel } : {}), ...(input.classArmId ? { id: input.classArmId } : {}),
    ...(!isSchoolAdmin(ctx.session.role) ? { formTeacherId: ctx.session.userId } : {}),
  }, select: armSelect, orderBy: [{ level: 'asc' }, { name: 'asc' }] })
  const allowed = new Map(arms.map(arm => [arm.id, arm]))
  const roster = (await rosterAt(ctx.db, term.academicSessionId, feeRosterDate(term))).filter(row => allowed.has(row.classArmId))
  const fees = await ctx.db.studentFee.findMany({ where: { termId: term.id, studentId: { in: roster.map(row => row.studentId) } }, select: feeSelect })
  const byStudent = new Map(fees.map(fee => [fee.studentId, fee]))
  const rows = roster.map(row => {
    const fee = byStudent.get(row.studentId)
    return { student: row.student, classArm: allowed.get(row.classArmId)!, status: fee?.status ?? 'OWING' as const, updatedAt: fee?.updatedAt ?? null, updatedBy: fee?.updatedBy.fullName ?? null }
  }).sort((a, b) => a.student.fullName.localeCompare(b.student.fullName) || a.student.id.localeCompare(b.student.id))
  const paid = rows.filter(row => row.status === 'PAID').length
  return { term: { id: term.id, name: term.name, session: term.academicSession.name }, rows, totals: { students: rows.length, paid, owing: rows.length - paid } }
}

export async function setFeeStatus(ctx: ScopedStaffContext, raw: z.infer<typeof feeStatusSchema>) {
  assertFeeStaff(ctx)
  const input = feeStatusSchema.parse(raw)
  return schoolTransaction(ctx.db, async tx => {
    await feeArm(ctx, tx, input.classArmId)
    const term = await ownTerm(tx, input.termId)
    const roster = await rosterAt(tx, term.academicSessionId, feeRosterDate(term), input.classArmId)
    if (!roster.some(row => row.studentId === input.studentId)) throw notFound('Student is not enrolled in this class for the selected term.')
    const where = { schoolId_studentId_termId: { schoolId: ctx.schoolId, studentId: input.studentId, termId: term.id } }
    const existing = await tx.studentFee.findUnique({ where, select: feeSelect })
    if (existing?.status === input.status) return existing
    return tx.studentFee.upsert({ where,
      create: { schoolId: ctx.schoolId, studentId: input.studentId, termId: term.id, status: input.status, updatedById: ctx.session.userId },
      update: { status: input.status, updatedById: ctx.session.userId }, select: feeSelect,
    })
  })
}
