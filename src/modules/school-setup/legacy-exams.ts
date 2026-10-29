import type { Prisma } from '@prisma/client'
import type { ScopedStaffContext } from '@/lib/auth/session'
import { conflict, notFound } from '@/lib/errors'
import { createExamSchema, updateExamSchema, type CreateExamInput, type UpdateExamInput } from '@/lib/validation/exam'
import { assertStaffScope } from '@/src/modules/shared/authorization'
import { schoolTransaction } from '@/src/modules/shared/transaction'
import { ensureSubject } from './subjects'

/** Preserve CBT's school-wide staff permissions and free-text subject contract. */
export async function createLegacyExam<T extends Prisma.ExamSelect>(
  context: ScopedStaffContext, input: CreateExamInput, select: T,
) {
  assertStaffScope(context)
  const data = createExamSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    const subject = await ensureSubject(tx, context.schoolId, data.subject)
    // Keep the runtime tenant extension while avoiding recursive Exact<> expansion
    // of the entire enlarged SMS relation graph for a generic legacy select.
    const exams = tx.exam as unknown as Prisma.TransactionClient['exam']
    return exams.create({
      data: {
        ...data,
        schoolId: context.schoolId,
        createdById: context.session.userId,
        subjectId: subject.id,
      },
      select,
    })
  })
}

export async function updateLegacyExam<T extends Prisma.ExamSelect>(
  context: ScopedStaffContext, examId: string, input: UpdateExamInput, select: T,
) {
  assertStaffScope(context)
  const data = updateExamSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { id: examId },
      include: { _count: { select: { examSessions: true } } },
    })
    if (!exam) throw notFound('Exam not found.')
    if (exam._count.examSessions > 0) {
      const frozen: string[] = []
      if (data.durationMins !== undefined && data.durationMins !== exam.durationMins) frozen.push('durationMins')
      if (data.classLevel !== undefined && data.classLevel !== exam.classLevel) frozen.push('classLevel')
      if (frozen.length) {
        throw conflict(`${exam._count.examSessions} student session(s) already exist for this exam, so ${frozen.join(' and ')} cannot be changed — it would alter the conditions of attempts that have already been graded.`, 'EXAM_HAS_SESSIONS')
      }
    }
    const subjectId = data.subject === undefined
      ? undefined
      : (await ensureSubject(tx, context.schoolId, data.subject)).id
    const exams = tx.exam as unknown as Prisma.TransactionClient['exam']
    return exams.update({ where: { id: examId }, data: { ...data, subjectId }, select })
  })
}
