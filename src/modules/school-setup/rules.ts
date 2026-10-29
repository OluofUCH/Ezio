import { z } from 'zod'
import type { ClassLevel } from '@/lib/core/domain'
import { conflict, notFound } from '@/lib/errors'

export function subjectIdentity(label: string): { name: string; normalizedName: string } {
  const name = z.string().transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, 'An existing exam has an empty subject label.')).parse(label)
  // Deliberately no fuzzy aliases: Mathematics and Maths remain separate subjects.
  return { name, normalizedName: name.toLowerCase() }
}

export type PlacementStudent = { id: string; schoolId: string; classLevel: ClassLevel }
export type CurrentPlacement = {
  studentId: string
  schoolId: string
  academicSessionId: string
  classArm: { schoolId: string; level: ClassLevel }
}

export function assertCurrentPlacement(
  student: PlacementStudent,
  session: { id: string; schoolId: string },
  placement: CurrentPlacement,
): void {
  if (student.schoolId !== session.schoolId || placement.schoolId !== student.schoolId ||
      placement.classArm.schoolId !== student.schoolId || placement.studentId !== student.id) {
    throw notFound('Enrollment not found in this school.')
  }
  if (placement.academicSessionId !== session.id) {
    throw conflict('The current enrollment belongs to another academic session. Review the placement before continuing.')
  }
  if (placement.classArm.level !== student.classLevel) {
    throw conflict('The current enrollment arm and CBT class level disagree. Review the placement before continuing.')
  }
}

export function defaultArmFor<T extends { id: string; schoolId: string; level: ClassLevel; isDefault: boolean }>(
  arms: readonly T[], schoolId: string, level: ClassLevel,
): T {
  const matches = arms.filter((arm) => arm.schoolId === schoolId && arm.level === level && arm.isDefault)
  if (matches.length !== 1) {
    throw conflict(`Configure exactly one default ${level} arm before changing this roster.`)
  }
  return matches[0]!
}
