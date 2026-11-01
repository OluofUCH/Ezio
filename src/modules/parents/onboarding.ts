import type { SchoolTransaction } from '@/src/modules/shared/transaction'
import { parentPhoneSchema } from './validation'
import type { GuardianAccountResult } from './rules'

type GuardianDetails = { guardianName?: string | null; guardianPhone?: string | null }
const parentSelect = { id: true, fullName: true, phone: true, isActive: true }

/** Called inside the same transaction that saves the student's profile. */
export async function onboardGuardian(tx: SchoolTransaction, schoolId: string, studentId: string, profile: GuardianDetails, defaultPinHash: string): Promise<GuardianAccountResult> {
  const name = profile.guardianName?.trim().replace(/\s+/g, ' ')
  const phone = profile.guardianPhone ? parentPhoneSchema.parse(profile.guardianPhone) : null
  if (!name || !phone) {
    await tx.parentStudent.updateMany({ where: { studentId, fromGuardianProfile: true, isActive: true }, data: { isActive: false } })
    return { status: 'incomplete' }
  }
  let parent = await tx.parent.findFirst({ where: { phone }, select: parentSelect })
  const created = !parent
  if (!parent) parent = await tx.parent.create({ data: { schoolId, fullName: name, phone, pinHash: defaultPinHash }, select: parentSelect })

  // Replace only links owned by the guardian-profile workflow. Other explicit
  // parent relationships are retained, and an administrator's unlink is respected.
  await tx.parentStudent.updateMany({ where: { studentId, parentId: { not: parent.id }, fromGuardianProfile: true, isActive: true }, data: { isActive: false } })
  let link = await tx.parentStudent.findFirst({ where: { parentId: parent.id, studentId }, select: { id: true, isActive: true, fromGuardianProfile: true } })
  if (!link) link = await tx.parentStudent.create({ data: { schoolId, parentId: parent.id, studentId, fromGuardianProfile: true }, select: { id: true, isActive: true, fromGuardianProfile: true } })
  else if (link.fromGuardianProfile && !link.isActive) link = await tx.parentStudent.update({ where: { id: link.id }, data: { isActive: true }, select: { id: true, isActive: true, fromGuardianProfile: true } })

  return { status: !parent.isActive || !link.isActive ? 'inactive' : created ? 'created' : 'linked', parentName: parent.fullName, phone: parent.phone }
}
