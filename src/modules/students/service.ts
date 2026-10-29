import type { ScopedStaffContext } from '@/lib/auth/session'
import type { ClassLevel } from '@/lib/core/domain'
import { z } from 'zod'
import type { TenantDb } from '@/lib/tenant'
import type { ParsedStudentRow } from '@/lib/import/students-csv'
import type { RowIssue } from '@/lib/import/questions-xlsx'
import { conflict, notFound } from '@/lib/errors'
import { createStudentSchema, updateStudentSchema, type UpdateStudentInput } from '@/lib/validation/student'
import { assertRosterManager } from '@/src/modules/shared/authorization'
import { schoolTransaction } from '@/src/modules/shared/transaction'
import { defaultArmFor } from '@/src/modules/school-setup/rules'
import { currentAcademicSetup, ensureCurrentEnrollment } from './enrollments'

type NewStudent = { regNumber: string; fullName: string; classLevel: ClassLevel; pin: string; arm?: string }
const rosterRowSchema = createStudentSchema.required({ pin: true }).extend({ arm: z.string().trim().max(120).optional() }).strict()
const armName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

function placement(arms: { id: string; schoolId: string; level: ClassLevel; name: string; isDefault: boolean }[], schoolId: string, row: NewStudent) {
  if (!row.arm) return defaultArmFor(arms, schoolId, row.classLevel)
  const matches = arms.filter((arm) => arm.schoolId === schoolId && arm.level === row.classLevel && armName(arm.name) === armName(row.arm!))
  if (matches.length !== 1) throw conflict(`Arm "${row.arm}" is not a unique ${row.classLevel} arm in this school.`)
  return matches[0]!
}

export async function rosterArmIssues(db: TenantDb, schoolId: string, rows: ParsedStudentRow[]): Promise<RowIssue[]> {
  const session = await db.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } })
  const arms = session ? await db.classArm.findMany() : []
  return rows.flatMap((row) => {
    try {
      if (row.arm && !session) throw conflict('Activate a session before importing arm placements.')
      if (session) placement(arms, schoolId, row)
      return []
    } catch (error) { return [{ row: row.row, column: 'arm', code: 'INVALID_ARM', message: (error as Error).message }] }
  })
}

/** Create-only, all-or-nothing, matching the existing CSV and single-create contracts. */
export async function createRosterStudents(context: ScopedStaffContext, rows: readonly NewStudent[]) {
  assertRosterManager(context)
  const input = rows.map((row) => rosterRowSchema.parse(row))
  return schoolTransaction(context.db, async (tx) => {
    const setup = await currentAcademicSetup(tx)
    if (!setup && input.some((row) => row.arm)) throw conflict('Activate an academic session before importing arm placements.')
    const arms = setup ? await tx.classArm.findMany() : []
    if (setup) {
      for (const row of input) placement(arms, context.schoolId, row)
    }
    const result = await tx.student.createMany({
      data: input.map((row) => ({ regNumber: row.regNumber, fullName: row.fullName, classLevel: row.classLevel, pin: row.pin, schoolId: context.schoolId })),
    })
    if (setup) {
      const students = await tx.student.findMany({
        where: { regNumber: { in: input.map((row) => row.regNumber) } },
        select: { id: true, classLevel: true, regNumber: true },
      })
      await tx.enrollment.createMany({
        data: students.map((student) => ({
          schoolId: context.schoolId,
          studentId: student.id,
          academicSessionId: setup.session.id,
          classArmId: placement(arms, context.schoolId, input.find((row) => row.regNumber === student.regNumber)!).id,
          sequence: 1,
          reason: 'INITIAL',
          isCurrent: true,
        })),
      })
    }
    return result
  })
}

/** Preserve legacy class edits while recording, rather than overwriting, placement history. */
export async function updateRosterStudent(context: ScopedStaffContext, studentId: string, input: UpdateStudentInput) {
  assertRosterManager(context)
  const data = updateStudentSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    const student = await tx.student.findFirst({ where: { id: studentId } })
    if (!student) throw notFound('Student not found.')
    const changingClass = data.classLevel !== undefined && data.classLevel !== student.classLevel
    if (changingClass) {
      const openSession = await tx.examSession.findFirst({
        where: { studentId, status: 'IN_PROGRESS' },
        select: { exam: { select: { title: true } } },
      })
      if (openSession) {
        throw conflict(`This student has an exam in progress ("${openSession.exam.title}"). Changing their class level now would make that session unresumable. Wait for it to be submitted.`)
      }
    }

    const setup = await currentAcademicSetup(tx)
    if (setup) {
      const { enrollment } = await ensureCurrentEnrollment(tx, student, setup, 'LEGACY_BACKFILL')
      if (changingClass) {
        if (enrollment.status !== 'ACTIVE') throw conflict('Review this student’s withdrawn enrollment before changing placement.')
        const arm = defaultArmFor(setup.arms, context.schoolId, data.classLevel!)
        const now = new Date()
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { isCurrent: false, effectiveTo: now },
        })
        const latest = await tx.enrollment.aggregate({
          where: { studentId, academicSessionId: setup.session.id },
          _max: { sequence: true },
        })
        await tx.enrollment.create({
          data: {
            schoolId: context.schoolId,
            studentId,
            academicSessionId: setup.session.id,
            classArmId: arm.id,
            sequence: (latest._max.sequence ?? 0) + 1,
            reason: 'PLACEMENT_CHANGE',
            effectiveFrom: now,
            isCurrent: true,
          },
        })
      }
    }
    return tx.student.update({ where: { id: studentId }, data })
  })
}
