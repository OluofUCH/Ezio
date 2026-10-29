import type { ScopedStaffContext } from '@/lib/auth/session'
import { conflict, notFound } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { schoolTransaction } from '@/src/modules/shared/transaction'
import { subjectIdentity } from './rules'
import { createClassArmSchema, createSubjectSchema, type CreateClassArmInput, type CreateSubjectInput } from './structure-validation'

const armSelect = { id: true, level: true, name: true, isDefault: true, _count: { select: { enrollments: true } } } as const
const subjectSelect = { id: true, name: true, _count: { select: { exams: true } } } as const
const normalizedArmName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export async function listClassArms(context: ScopedStaffContext) {
  assertSchoolAdministrator(context)
  return context.db.classArm.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }], select: armSelect })
}

export async function createClassArm(context: ScopedStaffContext, input: CreateClassArmInput) {
  assertSchoolAdministrator(context)
  const data = createClassArmSchema.parse(input)
  return schoolTransaction(context.db, async (tx) => {
    // Older operator-created arms may contain extra whitespace. Compare their
    // labels without rewriting them or adding a second, visually identical arm.
    const existing = await tx.classArm.findMany({ where: { level: data.level }, select: { name: true } })
    if (existing.some((arm) => normalizedArmName(arm.name) === normalizedArmName(data.name))) {
      throw conflict('An arm with this name already exists for this class level.')
    }
    return tx.classArm.create({ data: { ...data, schoolId: context.schoolId, isDefault: false }, select: armSelect })
  })
}

export async function setDefaultClassArm(context: ScopedStaffContext, rawId: string) {
  assertSchoolAdministrator(context)
  const armId = idSchema.parse(rawId)
  return schoolTransaction(context.db, async (tx) => {
    const arm = await tx.classArm.findFirst({ where: { id: armId }, select: armSelect })
    if (!arm) throw notFound('Class arm not found.')
    if (arm.isDefault) return arm
    await tx.classArm.updateMany({
      where: { level: arm.level, isDefault: true, id: { not: arm.id } }, data: { isDefault: false },
    })
    // The partial unique index backs up this transaction. Existing Enrollment
    // references and Student.classLevel are intentionally never rewritten here.
    return tx.classArm.update({ where: { id: arm.id }, data: { isDefault: true }, select: armSelect })
  })
}

export async function listSubjects(context: ScopedStaffContext) {
  assertSchoolAdministrator(context)
  return context.db.subject.findMany({ orderBy: { name: 'asc' }, select: subjectSelect })
}

export async function createSubject(context: ScopedStaffContext, input: CreateSubjectInput) {
  assertSchoolAdministrator(context)
  const identity = subjectIdentity(createSubjectSchema.parse(input).name)
  return schoolTransaction(context.db, async (tx) => {
    const existing = await tx.subject.findFirst({ where: { normalizedName: identity.normalizedName }, select: { id: true } })
    if (existing) throw conflict('A subject with this name already exists.')
    return tx.subject.create({ data: { ...identity, schoolId: context.schoolId }, select: subjectSelect })
  })
}
