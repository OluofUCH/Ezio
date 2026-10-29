import { z } from 'zod'
import sharp from 'sharp'
import type { ScopedStaffContext } from '@/lib/auth/session'
import { conflict, notFound, forbidden } from '@/lib/errors'
import { CLASS_LEVELS } from '@/lib/core/domain'
import { idSchema, fullNameSchema, pinSchema, regNumberSchema, paginationSchema, paginate, pageMeta } from '@/lib/validation/common'
import { generatePin } from '@/lib/auth/pin'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { asDatabaseDate, calendarDateSchema } from '@/src/modules/shared/calendar-date'
import { schoolTransaction } from '@/src/modules/shared/transaction'
import { defaultArmFor } from '@/src/modules/school-setup/rules'

const text = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional()
export const studentProfileSchema = z.object({
  fullName: fullNameSchema.optional(), pin: pinSchema.optional(), dateOfBirth: calendarDateSchema.nullable().optional(),
  gender: text(40), address: text(500), guardianName: text(120), guardianRelationship: text(80),
  guardianPhone: text(40), guardianEmail: z.union([z.literal(''), z.string().email().max(254)]).transform((v) => v || null).nullable().optional(),
}).strict()
export const managedStudentSchema = z.object({ regNumber: regNumberSchema, fullName: fullNameSchema, classArmId: idSchema, pin: pinSchema.optional() }).strict()
export const studentListSchema = paginationSchema.extend({ search: z.string().trim().max(100).optional(), classArmId: idSchema.optional() }).strict()
export const transitionSchema = z.object({
  studentId: idSchema, academicSessionId: idSchema, classArmId: idSchema.optional(),
  reason: z.enum(['INITIAL', 'PROMOTION', 'REPEAT', 'TRANSFER', 'WITHDRAWAL']),
  effectiveDate: calendarDateSchema, transferOut: z.boolean().default(false),
}).strict()

export async function listManagedStudents(ctx: ScopedStaffContext, raw: z.infer<typeof studentListSchema>) {
  assertSchoolAdministrator(ctx)
  const input = studentListSchema.parse(raw)
  const where = {
    ...(input.search ? { OR: [{ fullName: { contains: input.search, mode: 'insensitive' as const } }, { regNumber: { contains: input.search.toUpperCase() } }] } : {}),
    ...(input.classArmId ? { enrollments: { some: { isCurrent: true, classArmId: input.classArmId } } } : {}),
  }
  const [students, total] = await Promise.all([
    ctx.db.student.findMany({ where, ...paginate(input), orderBy: { fullName: 'asc' }, select: {
      id: true, regNumber: true, fullName: true, classLevel: true, pin: true,
      profile: true, photo: { select: { updatedAt: true } },
      enrollments: { include: { classArm: true, academicSession: true }, orderBy: [{ createdAt: 'desc' }], take: 30 },
    } }), ctx.db.student.count({ where }),
  ])
  return { students, meta: pageMeta(total, input) }
}

export async function createManagedStudent(ctx: ScopedStaffContext, raw: z.infer<typeof managedStudentSchema>) {
  assertSchoolAdministrator(ctx)
  const input = managedStudentSchema.parse(raw)
  return schoolTransaction(ctx.db, async (tx) => {
    const arm = await tx.classArm.findFirst({ where: { id: input.classArmId } })
    const session = await tx.academicSession.findFirst({ where: { isCurrent: true } })
    if (!arm) throw notFound('Class arm not found.')
    if (!session) throw conflict('Activate an academic session before admitting students into arms.')
    const student = await tx.student.create({ data: { schoolId: ctx.schoolId, regNumber: input.regNumber, fullName: input.fullName, classLevel: arm.level, pin: input.pin ?? generatePin() } })
    await tx.enrollment.create({ data: { schoolId: ctx.schoolId, studentId: student.id, academicSessionId: session.id, classArmId: arm.id, sequence: 1, isCurrent: true, reason: 'INITIAL' } })
    return student
  })
}

export async function updateManagedStudent(ctx: ScopedStaffContext, id: string, raw: z.infer<typeof studentProfileSchema>) {
  assertSchoolAdministrator(ctx)
  const { fullName, pin, dateOfBirth, ...profile } = studentProfileSchema.parse(raw)
  if (dateOfBirth && asDatabaseDate(dateOfBirth) > new Date()) throw conflict('Date of birth cannot be in the future.')
  return schoolTransaction(ctx.db, async (tx) => {
    if (!await tx.student.findFirst({ where: { id }, select: { id: true } })) throw notFound('Student not found.')
    if (pin && await tx.examSession.findFirst({ where: { studentId: id, status: 'IN_PROGRESS' }, select: { id: true } })) throw conflict('Wait for the open exam to finish before changing the PIN.')
    if (fullName || pin) await tx.student.update({ where: { id }, data: { fullName, pin } })
    const data = { ...profile, dateOfBirth: dateOfBirth === undefined ? undefined : dateOfBirth === null ? null : asDatabaseDate(dateOfBirth) }
    return tx.studentProfile.upsert({ where: { schoolId_studentId: { schoolId: ctx.schoolId, studentId: id } }, create: { schoolId: ctx.schoolId, studentId: id, ...data }, update: data })
  })
}

export async function saveStudentPhoto(ctx: ScopedStaffContext, studentId: string, input: Buffer) {
  assertSchoolAdministrator(ctx)
  if (!await ctx.db.student.findFirst({ where: { id: studentId }, select: { id: true } })) throw notFound('Student not found.')
  const image = sharp(input, { limitInputPixels: 12_000_000, failOn: 'error' })
  const metadata = await image.metadata().catch(() => null)
  if (!metadata || !['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw conflict('Use a JPEG, PNG or WebP photo.')
  let data = await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  if (data.length > 262144) data = await sharp(data).resize(384, 384, { fit: 'inside' }).jpeg({ quality: 65 }).toBuffer()
  if (data.length > 262144) throw conflict('The resized photo exceeds 256 KB.')
  const bytes = new Uint8Array(data)
  await ctx.db.studentPhoto.upsert({ where: { schoolId_studentId: { schoolId: ctx.schoolId, studentId } }, create: { schoolId: ctx.schoolId, studentId, mimeType: 'image/jpeg', data: bytes }, update: { mimeType: 'image/jpeg', data: bytes } })
  return { saved: true }
}

export async function changeEnrollment(ctx: ScopedStaffContext, raw: z.infer<typeof transitionSchema>) {
  assertSchoolAdministrator(ctx)
  const input = transitionSchema.parse(raw)
  return schoolTransaction(ctx.db, async (tx) => {
    const student = await tx.student.findFirst({ where: { id: input.studentId } })
    const session = await tx.academicSession.findFirst({ where: { id: input.academicSessionId } })
    if (!student || !session) throw notFound('Student or session not found.')
    const current = await tx.enrollment.findFirst({ where: { studentId: student.id, isCurrent: true }, include: { classArm: true, academicSession: true } })
    const exiting = input.reason === 'WITHDRAWAL' || (input.reason === 'TRANSFER' && input.transferOut)
    if (exiting && (!current || !session.isCurrent)) throw conflict('Withdraw or transfer out from the current session.')
    const arm = await tx.classArm.findFirst({ where: { id: exiting ? current!.classArmId : input.classArmId ?? '' } })
    if (!arm) throw notFound('Target class arm not found.')
    const previousLevel = current?.classArm.level ?? student.classLevel
    if (input.reason === 'PROMOTION' && CLASS_LEVELS.indexOf(arm.level) !== CLASS_LEVELS.indexOf(previousLevel) + 1) throw conflict('Promotion must move to the next JSS/SS class level.')
    if (input.reason === 'REPEAT' && arm.level !== previousLevel) throw conflict('Repeating keeps the same class level.')
    if (input.reason === 'TRANSFER' && !exiting && arm.level !== previousLevel) throw conflict('An arm transfer keeps the same class level. Use promotion for a level change.')
    const date = asDatabaseDate(input.effectiveDate)
    if (date < session.startDate || date > session.endDate) throw conflict('The effective date must be inside the target academic session.')
    const effectiveFrom = input.effectiveDate === new Date().toISOString().slice(0, 10) ? new Date() : date
    const previous = session.isCurrent ? current : await tx.enrollment.findFirst({ where: { studentId: student.id, academicSessionId: session.id, isCurrent: false, effectiveTo: null }, orderBy: { sequence: 'desc' } })
    if (previous && effectiveFrom < previous.effectiveFrom) throw conflict('A placement change cannot predate the placement it replaces.')
    if (session.isCurrent && await tx.examSession.findFirst({ where: { studentId: student.id, status: 'IN_PROGRESS' }, select: { id: true } })) throw conflict('Finish the student’s open CBT attempt before changing placement.')
    if (previous) await tx.enrollment.update({ where: { id: previous.id }, data: { isCurrent: false, effectiveTo: effectiveFrom } })
    const latest = await tx.enrollment.aggregate({ where: { studentId: student.id, academicSessionId: session.id }, _max: { sequence: true } })
    const enrollment = await tx.enrollment.create({ data: { schoolId: ctx.schoolId, studentId: student.id, academicSessionId: session.id, classArmId: arm.id, sequence: (latest._max.sequence ?? 0) + 1, status: exiting ? 'WITHDRAWN' : 'ACTIVE', reason: input.reason, effectiveFrom, isCurrent: session.isCurrent } })
    if (session.isCurrent) await tx.student.update({ where: { id: student.id }, data: { classLevel: arm.level } })
    return enrollment
  })
}

export async function activateAcademicSession(ctx: ScopedStaffContext, sessionId: string) {
  assertSchoolAdministrator(ctx)
  return schoolTransaction(ctx.db, async (tx) => {
    const target = await tx.academicSession.findFirst({ where: { id: sessionId } })
    if (!target) throw notFound('Academic session not found.')
    if (target.isCurrent) return { activated: true, students: 0 }
    const old = await tx.academicSession.findFirst({ where: { isCurrent: true } })
    const defaults = await tx.classArm.findMany({ where: { isDefault: true } })
    if (await tx.examSession.findFirst({ where: { status: 'IN_PROGRESS' }, select: { id: true } })) throw conflict('Finish all open cloud CBT sittings before session rollover.')
    const students = await tx.student.findMany({ include: { enrollments: { where: { OR: [{ isCurrent: true }, { academicSessionId: target.id, effectiveTo: null }] }, include: { classArm: true }, orderBy: { sequence: 'desc' } } } })
    const now = new Date()
    let changed = 0
    for (const student of students) {
      const current = student.enrollments.find((entry) => entry.isCurrent)
      let planned = student.enrollments.find((entry) => entry.academicSessionId === target.id && !entry.isCurrent && !entry.effectiveTo)
      if (!planned && current?.status === 'WITHDRAWN') continue
      if (!planned && old) throw conflict(`Stage a placement for ${student.regNumber} in the target session before rollover.`)
      if (!planned) {
        const arm = defaultArmFor(defaults, ctx.schoolId, student.classLevel)
        planned = await tx.enrollment.create({ data: { schoolId: ctx.schoolId, studentId: student.id, academicSessionId: target.id, classArmId: arm.id, sequence: 1, reason: 'LEGACY_BACKFILL', effectiveFrom: now }, include: { classArm: true } })
      }
      if (current) await tx.enrollment.update({ where: { id: current.id }, data: { isCurrent: false, effectiveTo: now } })
      await tx.enrollment.update({ where: { id: planned.id }, data: { isCurrent: true } })
      await tx.student.update({ where: { id: student.id }, data: { classLevel: planned.classArm.level } })
      changed++
    }
    if (old) await tx.academicSession.update({ where: { id: old.id }, data: { isCurrent: false } })
    await tx.academicSession.update({ where: { id: target.id }, data: { isCurrent: true } })
    return { activated: true, students: changed }
  }, 120_000)
}

export async function assertStudentCanStart(db: Pick<ScopedStaffContext['db'], 'enrollment'>, studentId: string) {
  const enrollment = await db.enrollment.findFirst({ where: { studentId, isCurrent: true }, select: { status: true } })
  if (enrollment?.status === 'WITHDRAWN') throw forbidden('This student has withdrawn or transferred out and cannot start new exams.')
}
