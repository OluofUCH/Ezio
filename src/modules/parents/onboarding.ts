import type { SchoolTransaction } from '@/src/modules/shared/transaction'
import { parentPhoneSchema } from './validation'
import type { GuardianAccountResult } from './rules'

type GuardianDetails = { guardianName?: string | null; guardianPhone?: string | null }
const parentSelect = { id: true, fullName: true, phone: true, isActive: true }

function guardianIdentity(profile: GuardianDetails) {
  const name = profile.guardianName?.trim().replace(/\s+/g, ' ')
  const phone = profile.guardianPhone ? parentPhoneSchema.parse(profile.guardianPhone) : null
  return name && phone ? { name, phone } : null
}

/** Called inside the same transaction that saves the student's profile. */
export async function onboardGuardian(tx: SchoolTransaction, schoolId: string, studentId: string, profile: GuardianDetails, defaultPinHash: string): Promise<GuardianAccountResult> {
  const identity = guardianIdentity(profile)
  if (!identity) {
    await tx.parentStudent.updateMany({ where: { studentId, fromGuardianProfile: true, isActive: true }, data: { isActive: false } })
    return { status: 'incomplete' }
  }
  const { name, phone } = identity
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

/** Create-only roster batches have no existing child links to replace. Batch the
 * same guardian matching rules to avoid per-student database round trips. */
export async function onboardNewStudentGuardians(tx: SchoolTransaction, schoolId: string, profiles: (GuardianDetails & { studentId: string })[], defaultPinHash: string) {
  const identities = profiles.map(profile => ({ studentId: profile.studentId, guardian: guardianIdentity(profile) }))
  const guardians = new Map<string, string>()
  for (const { guardian } of identities) if (guardian && !guardians.has(guardian.phone)) guardians.set(guardian.phone, guardian.name)
  const accounts = guardians.size ? await tx.parent.findMany({ where: { phone: { in: [...guardians.keys()] } }, select: parentSelect }) : []
  const existingPhones = new Set(accounts.map(parent => parent.phone))
  const missing = [...guardians].filter(([phone]) => !existingPhones.has(phone))
  if (missing.length) {
    await tx.parent.createMany({ data: missing.map(([phone, fullName]) => ({ schoolId, phone, fullName, pinHash: defaultPinHash })) })
    accounts.push(...await tx.parent.findMany({ where: { phone: { in: missing.map(([phone]) => phone) } }, select: parentSelect }))
  }
  const byPhone = new Map(accounts.map(parent => [parent.phone, parent]))
  const results = new Map<string, GuardianAccountResult>()
  const links: { schoolId: string; studentId: string; parentId: string; fromGuardianProfile: boolean }[] = []
  for (const { studentId, guardian } of identities) {
    if (!guardian) { results.set(studentId, { status: 'incomplete' }); continue }
    const parent = byPhone.get(guardian.phone)!
    results.set(studentId, { status: !parent.isActive ? 'inactive' : existingPhones.has(parent.phone) ? 'linked' : 'created', parentName: parent.fullName, phone: parent.phone })
    existingPhones.add(parent.phone)
    links.push({ schoolId, studentId, parentId: parent.id, fromGuardianProfile: true })
  }
  if (links.length) await tx.parentStudent.createMany({ data: links })
  return results
}
