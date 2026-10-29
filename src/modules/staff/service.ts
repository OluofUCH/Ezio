import type { ScopedStaffContext } from '@/lib/auth/session'
import { conflict, notFound } from '@/lib/errors'
import { idSchema, pageMeta, paginate } from '@/lib/validation/common'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { schoolTransaction, type SchoolTransaction } from '@/src/modules/shared/transaction'
import { assertTeacherEligibility } from './rules'
import { hashPassword } from '@/lib/auth/password'
import { createTeacherSchema, updateTeacherAccountSchema } from './validation'
import type { z } from 'zod'
import {
  teacherListSchema, updateTeacherProfileSchema, createTeachingAssignmentSchema,
  assignmentListSchema, assignmentStatusSchema, formTeacherSchema,
  type TeacherListInput, type UpdateTeacherProfileInput, type CreateTeachingAssignmentInput, type AssignmentListInput,
} from './validation'

const teacherSelect = { id: true, fullName: true, email: true, role: true, isActive: true } as const
const profileSelect = { userId: true, phone: true, qualifications: true, updatedAt: true } as const
const assignmentSelect = {
  id: true, isActive: true, createdAt: true, updatedAt: true,
  teacher: { select: teacherSelect },
  subject: { select: { id: true, name: true } },
  classArm: { select: { id: true, level: true, name: true } },
  academicSession: { select: { id: true, name: true, isCurrent: true } },
} as const

async function resolveTeacher(tx: Pick<SchoolTransaction, 'user'>, teacherId: string, active: boolean) {
  const teacher = await tx.user.findFirst({ where: { id: teacherId, role: 'TEACHER' }, select: teacherSelect })
  return assertTeacherEligibility(teacher, active)
}

export async function createTeacher(context: ScopedStaffContext, input: z.infer<typeof createTeacherSchema>) {
  assertSchoolAdministrator(context)
  const data = createTeacherSchema.parse(input)
  const passwordHash = await hashPassword(data.password)
  return context.db.user.create({ data: { schoolId: context.schoolId, fullName: data.fullName, email: data.email, passwordHash, role: 'TEACHER' }, select: teacherSelect })
}

export async function updateTeacherAccount(context: ScopedStaffContext, id: string, input: z.infer<typeof updateTeacherAccountSchema>) {
  assertSchoolAdministrator(context)
  const data = updateTeacherAccountSchema.parse(input)
  const passwordHash = data.password ? await hashPassword(data.password) : undefined
  return schoolTransaction(context.db, async (tx) => {
    await resolveTeacher(tx, idSchema.parse(id), false)
    return tx.user.update({ where: { id }, data: { fullName: data.fullName, isActive: data.isActive, passwordHash }, select: teacherSelect })
  })
}

export async function listTeachers(context: ScopedStaffContext, input: TeacherListInput) {
  assertSchoolAdministrator(context)
  const query = teacherListSchema.parse(input)
  const where = {
    role: 'TEACHER' as const,
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search ? { OR: [
      { fullName: { contains: query.search, mode: 'insensitive' as const } },
      { email: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {}),
  }
  const [teachers, total] = await Promise.all([
    context.db.user.findMany({ where, ...paginate(query), orderBy: { fullName: 'asc' }, select: {
      ...teacherSelect,
      teacherProfile: { select: profileSelect },
      formTeacherArms: { select: { id: true, level: true, name: true }, orderBy: [{ level: 'asc' }, { name: 'asc' }] },
    } }),
    context.db.user.count({ where }),
  ])
  return { teachers, meta: pageMeta(total, query) }
}

export async function updateTeacherProfile(context: ScopedStaffContext, rawTeacherId: string, input: UpdateTeacherProfileInput) {
  assertSchoolAdministrator(context)
  const teacherId = idSchema.parse(rawTeacherId)
  const data = updateTeacherProfileSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    // Retired teachers' contact details remain manageable; assignment activation
    // below has the stronger active-account requirement.
    await resolveTeacher(tx, teacherId, false)
    return tx.teacherProfile.upsert({
      where: { schoolId_userId: { schoolId: context.schoolId, userId: teacherId } },
      create: { schoolId: context.schoolId, userId: teacherId, phone: data.phone ?? null, qualifications: data.qualifications ?? null },
      update: data,
      select: profileSelect,
    })
  })
}

export async function listTeachingAssignments(context: ScopedStaffContext, input: AssignmentListInput) {
  assertSchoolAdministrator(context)
  const query = assignmentListSchema.parse(input)
  const where = {
    teacherId: query.teacherId, subjectId: query.subjectId, classArmId: query.classArmId,
    academicSessionId: query.academicSessionId, isActive: query.isActive,
  }
  const [assignments, total] = await Promise.all([
    context.db.teachingAssignment.findMany({ where, ...paginate(query), orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: assignmentSelect }),
    context.db.teachingAssignment.count({ where }),
  ])
  return { assignments, meta: pageMeta(total, query) }
}

export async function createTeachingAssignment(context: ScopedStaffContext, input: CreateTeachingAssignmentInput) {
  assertSchoolAdministrator(context)
  const data = createTeachingAssignmentSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    await resolveTeacher(tx, data.teacherId, true)
    const [subject, arm, session] = await Promise.all([
      tx.subject.findFirst({ where: { id: data.subjectId }, select: { id: true } }),
      tx.classArm.findFirst({ where: { id: data.classArmId }, select: { id: true } }),
      tx.academicSession.findFirst({ where: { id: data.academicSessionId }, select: { id: true } }),
    ])
    if (!subject || !arm || !session) throw notFound('Subject, class arm or academic session not found.')
    const existing = await tx.teachingAssignment.findFirst({ where: data, select: { id: true, isActive: true } })
    if (existing?.isActive) throw conflict('This teaching assignment already exists.')
    if (existing) return tx.teachingAssignment.update({ where: { id: existing.id }, data: { isActive: true }, select: assignmentSelect })
    return tx.teachingAssignment.create({ data: { ...data, schoolId: context.schoolId }, select: assignmentSelect })
  })
}

export async function setTeachingAssignmentStatus(context: ScopedStaffContext, rawAssignmentId: string, input: { isActive: boolean }) {
  assertSchoolAdministrator(context)
  const assignmentId = idSchema.parse(rawAssignmentId)
  const { isActive } = assignmentStatusSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    const assignment = await tx.teachingAssignment.findFirst({ where: { id: assignmentId }, select: { id: true, teacherId: true } })
    if (!assignment) throw notFound('Teaching assignment not found.')
    if (isActive) await resolveTeacher(tx, assignment.teacherId, true)
    return tx.teachingAssignment.update({ where: { id: assignment.id }, data: { isActive }, select: assignmentSelect })
  })
}

export async function setFormTeacher(context: ScopedStaffContext, rawArmId: string, input: { teacherId: string | null }) {
  assertSchoolAdministrator(context)
  const armId = idSchema.parse(rawArmId)
  const { teacherId } = formTeacherSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    const arm = await tx.classArm.findFirst({ where: { id: armId }, select: { id: true } })
    if (!arm) throw notFound('Class arm not found.')
    if (teacherId) await resolveTeacher(tx, teacherId, true)
    return tx.classArm.update({ where: { id: arm.id }, data: { formTeacherId: teacherId }, select: {
      id: true, level: true, name: true, formTeacher: { select: teacherSelect },
    } })
  })
}
