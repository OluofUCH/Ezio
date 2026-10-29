import type { ScopedStaffContext } from '@/lib/auth/session'
import { conflict, notFound } from '@/lib/errors'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { asDatabaseDate } from '@/src/modules/shared/calendar-date'
import { schoolTransaction } from '@/src/modules/shared/transaction'
import {
  createAcademicSessionSchema, createTermSchema,
  type CreateAcademicSessionInput, type CreateTermInput,
} from './calendar-validation'

const termSelect = { id: true, name: true, orderIndex: true, startDate: true, endDate: true } as const
const sessionSelect = {
  id: true, name: true, startDate: true, endDate: true, isCurrent: true,
  terms: { select: termSelect, orderBy: { orderIndex: 'asc' as const } },
} as const

export async function listAcademicCalendar(context: ScopedStaffContext) {
  assertSchoolAdministrator(context)
  return context.db.academicSession.findMany({ orderBy: { startDate: 'desc' }, select: sessionSelect })
}

export async function createAcademicSession(context: ScopedStaffContext, input: CreateAcademicSessionInput) {
  assertSchoolAdministrator(context)
  const data = createAcademicSessionSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    const duplicate = await tx.academicSession.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' } }, select: { id: true } })
    if (duplicate) throw conflict('An academic session with this name already exists.')
    return tx.academicSession.create({
      data: { schoolId: context.schoolId, name: data.name, startDate: asDatabaseDate(data.startDate), endDate: asDatabaseDate(data.endDate), isCurrent: false },
      select: sessionSelect,
    })
  })
}

export async function createTerm(context: ScopedStaffContext, sessionId: string, input: CreateTermInput) {
  assertSchoolAdministrator(context)
  const data = createTermSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    const session = await tx.academicSession.findFirst({ where: { id: sessionId }, select: { id: true, startDate: true, endDate: true } })
    if (!session) throw notFound('Academic session not found.')
    const startDate = asDatabaseDate(data.startDate)
    const endDate = asDatabaseDate(data.endDate)
    if (startDate < session.startDate || endDate > session.endDate) {
      throw conflict('Term dates must be within the academic session.')
    }
    const duplicate = await tx.term.findFirst({
      where: { academicSessionId: session.id, OR: [{ orderIndex: data.orderIndex }, { name: { equals: data.name, mode: 'insensitive' } }] },
      select: { id: true },
    })
    if (duplicate) throw conflict('This session already has a term with that name or order.')
    const overlap = await tx.term.findFirst({
      where: { academicSessionId: session.id, startDate: { lte: endDate }, endDate: { gte: startDate } },
      select: { id: true },
    })
    if (overlap) throw conflict('Term dates must not overlap another term in this session.')
    return tx.term.create({ data: { schoolId: context.schoolId, academicSessionId: session.id, name: data.name, orderIndex: data.orderIndex, startDate, endDate }, select: termSelect })
  })
}
