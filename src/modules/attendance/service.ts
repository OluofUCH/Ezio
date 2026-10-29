import { z } from 'zod'
import type { ScopedStaffContext } from '@/lib/auth/session'
import type { TenantDb } from '@/lib/tenant'
import { conflict, notFound } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { calendarDateSchema, asDatabaseDate } from '@/src/modules/shared/calendar-date'
import { assertArmAccess, ownTerm, rosterAt } from '@/src/modules/shared/access'
import { schoolTransaction } from '@/src/modules/shared/transaction'

export const rollQuerySchema = z.object({ classArmId: idSchema, termId: idSchema, date: calendarDateSchema }).strict()
export const markAttendanceSchema = rollQuerySchema.extend({ entries: z.array(z.object({ enrollmentId: idSchema, status: z.enum(['PRESENT', 'ABSENT', 'LATE']) }).strict()).min(1).max(1000) }).strict()

async function validateRoll(ctx: ScopedStaffContext, input: z.infer<typeof rollQuerySchema>) {
  const term = await ownTerm(ctx.db, input.termId)
  await assertArmAccess(ctx, input.classArmId, term.academicSessionId, true)
  const date = asDatabaseDate(input.date)
  if (date < term.startDate || date > term.endDate) throw conflict('Attendance date must be within the term.')
  if (input.date > new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) throw conflict('Attendance cannot be recorded for a future date.')
  return { term, date }
}

export async function getRoll(ctx: ScopedStaffContext, raw: z.infer<typeof rollQuerySchema>) {
  const input = rollQuerySchema.parse(raw)
  const { term, date } = await validateRoll(ctx, input)
  const roster = await rosterAt(ctx.db, term.academicSessionId, date, input.classArmId)
  const marks = await ctx.db.attendance.findMany({ where: { termId: term.id, date, enrollmentId: { in: roster.map((e) => e.id) } } })
  return { term, date, roster: roster.map((e) => ({ enrollmentId: e.id, student: e.student, status: marks.find((m) => m.enrollmentId === e.id)?.status ?? null })) }
}

export async function markAttendance(ctx: ScopedStaffContext, raw: z.infer<typeof markAttendanceSchema>) {
  const input = markAttendanceSchema.parse(raw)
  const { term, date } = await validateRoll(ctx, input)
  if (new Set(input.entries.map((e) => e.enrollmentId)).size !== input.entries.length) throw conflict('Duplicate enrollment in attendance request.')
  return schoolTransaction(ctx.db, async (tx) => {
    const roster = await rosterAt(tx, term.academicSessionId, date, input.classArmId)
    const allowed = new Set(roster.map((e) => e.id))
    for (const entry of input.entries) {
      if (!allowed.has(entry.enrollmentId)) throw notFound('Enrollment is not in this arm for this date.')
      await tx.attendance.upsert({ where: { schoolId_enrollmentId_date: { schoolId: ctx.schoolId, enrollmentId: entry.enrollmentId, date } },
        create: { schoolId: ctx.schoolId, enrollmentId: entry.enrollmentId, termId: term.id, date, status: entry.status, markedById: ctx.session.userId },
        update: { status: entry.status, markedById: ctx.session.userId },
      })
    }
    return { marked: input.entries.length }
  }, 60_000)
}

export function attendanceTotals(rows: { status: string }[]) {
  const present = rows.filter((r) => r.status === 'PRESENT').length
  const late = rows.filter((r) => r.status === 'LATE').length
  const absent = rows.filter((r) => r.status === 'ABSENT').length
  return { present, late, absent, marked: rows.length, rate: rows.length ? Math.round((present + late) / rows.length * 10000) / 100 : null }
}

export async function studentAttendance(db: TenantDb, studentId: string) {
  const rows = await db.attendance.findMany({ where: { enrollment: { studentId } }, include: { term: { select: { id: true, name: true, academicSession: { select: { name: true } } } } }, orderBy: { date: 'desc' } })
  return { summary: attendanceTotals(rows), terms: [...new Set(rows.map((r) => r.termId))].map((id) => ({ term: rows.find((r) => r.termId === id)!.term, ...attendanceTotals(rows.filter((r) => r.termId === id)) })), records: rows }
}
