import type { Prisma } from '@prisma/client'
import type { z } from 'zod'
import type { ScopedStaffContext } from '@/lib/auth/session'
import type { ScopedParentContext } from '@/lib/auth/parent'
import type { ReportSnapshot } from '@/src/modules/results/service'
import { hashPassword } from '@/lib/auth/password'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { idSchema, paginate, pageMeta } from '@/lib/validation/common'
import { assertSchoolAdministrator, assertStaffScope } from '@/src/modules/shared/authorization'
import { schoolTransaction, type SchoolTransaction } from '@/src/modules/shared/transaction'
import { commentQuerySchema, commentSchema, parentListSchema, teacherFamiliesSchema, updateParentSchema } from './validation'

const childSelect = { id: true, fullName: true, regNumber: true, classLevel: true } satisfies Prisma.StudentSelect
const parentSelect = {
  id: true, fullName: true, phone: true, isActive: true,
  children: { where: { isActive: true }, select: { id: true, student: { select: childSelect } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ParentSelect
const currentEnrollment = { isCurrent: true, status: 'ACTIVE', academicSession: { isCurrent: true } } satisfies Prisma.EnrollmentWhereInput
const familyInclude = {
  parent: { select: { id: true, fullName: true, isActive: true } },
  student: { select: { ...childSelect, enrollments: {
    where: currentEnrollment,
    select: { classArm: { select: { id: true, level: true, name: true, formTeacher: { select: { id: true, fullName: true, role: true, isActive: true } } } } },
    take: 1,
  } } },
} satisfies Prisma.ParentStudentInclude
type Family = Prisma.ParentStudentGetPayload<{ include: typeof familyInclude }>

function familyDetails(family: Family) {
  const arm = family.student.enrollments[0]?.classArm
  const teacher = arm?.formTeacher
  return {
    parentStudentId: family.id,
    parent: { id: family.parent.id, fullName: family.parent.fullName },
    student: { id: family.student.id, fullName: family.student.fullName, regNumber: family.student.regNumber, classLevel: family.student.classLevel },
    classArm: arm ? { id: arm.id, level: arm.level, name: arm.name } : null,
    formTeacher: teacher?.isActive && teacher.role === 'TEACHER' ? { id: teacher.id, fullName: teacher.fullName } : null,
  }
}

export async function listParents(ctx: ScopedStaffContext, raw: z.infer<typeof parentListSchema>) {
  assertSchoolAdministrator(ctx)
  const input = parentListSchema.parse(raw)
  const where: Prisma.ParentWhereInput = input.search ? { OR: [
    { fullName: { contains: input.search, mode: 'insensitive' } }, { phone: { contains: input.search } },
    { children: { some: { isActive: true, student: { OR: [{ fullName: { contains: input.search, mode: 'insensitive' } }, { regNumber: { contains: input.search.toUpperCase() } }] } } } },
  ] } : {}
  const [parents, total, school] = await Promise.all([
    ctx.db.parent.findMany({ where, select: parentSelect, ...paginate(input), orderBy: [{ fullName: 'asc' }, { id: 'asc' }] }),
    ctx.db.parent.count({ where }), ctx.db.school.findFirst({ select: { slug: true } }),
  ])
  return { parents, meta: pageMeta(total, input), schoolCode: school?.slug ?? '' }
}

export async function updateParent(ctx: ScopedStaffContext, raw: z.infer<typeof updateParentSchema>) {
  assertSchoolAdministrator(ctx)
  const { parentId, pin, ...data } = updateParentSchema.parse(raw)
  const pinHash = pin ? await hashPassword(pin) : undefined
  return schoolTransaction(ctx.db, async tx => {
    const parent = await tx.parent.findFirst({ where: { id: parentId }, select: { id: true, phone: true } })
    if (!parent) throw notFound('Parent not found.')
    const revoke = Boolean(pinHash || data.isActive !== undefined || data.phone && data.phone !== parent.phone)
    const updated = await tx.parent.update({ where: { id: parent.id }, data: { ...data, pinHash, ...(revoke ? { authVersion: { increment: 1 } } : {}) }, select: parentSelect })
    if (data.phone && data.phone !== parent.phone) {
      await tx.studentProfile.updateMany({ where: { guardianPhone: parent.phone, student: { parents: { some: { parentId: parent.id, fromGuardianProfile: true, isActive: true } } } }, data: { guardianPhone: data.phone } })
    }
    return updated
  })
}

function parentScope(ctx: ScopedParentContext) {
  if (ctx.session.typ !== 'parent' || !ctx.session.parentId || ctx.session.schoolId !== ctx.schoolId) throw forbidden('Parent access required.')
  return { parentId: ctx.session.parentId, isActive: true, parent: { isActive: true, authVersion: ctx.session.authVersion } }
}

export async function parentChildren(ctx: ScopedParentContext) {
  const families = await ctx.db.parentStudent.findMany({ where: parentScope(ctx), include: familyInclude, orderBy: { student: { fullName: 'asc' } } })
  return families.map(familyDetails)
}

export async function assertParentChild(ctx: ScopedParentContext, studentId: string) {
  const link = await ctx.db.parentStudent.findFirst({ where: { ...parentScope(ctx), studentId: idSchema.parse(studentId) }, select: { id: true } })
  if (!link) throw notFound('Child not found.')
  return link
}

export async function childReports(ctx: ScopedParentContext, studentId: string) {
  await assertParentChild(ctx, studentId)
  const reports = await ctx.db.reportCard.findMany({ where: { status: 'PUBLISHED', enrollment: { studentId } }, select: {
    id: true, total: true, average: true, position: true, teacherRemark: true, principalRemark: true, snapshot: true, publishedAt: true,
    enrollment: { select: { student: { select: { fullName: true } } } },
  }, orderBy: [{ term: { startDate: 'desc' } }, { id: 'asc' }] })
  return reports.map(({ enrollment, ...report }) => ({ ...report, snapshot: { ...report.snapshot as unknown as ReportSnapshot, student: enrollment.student.fullName } }))
}

function formTeacherScope(ctx: ScopedStaffContext, classArmId?: string): Prisma.EnrollmentWhereInput {
  assertStaffScope(ctx)
  if (ctx.session.typ !== 'staff' || ctx.session.role !== 'TEACHER') throw forbidden('Form teacher access required.')
  return { ...currentEnrollment, ...(classArmId ? { classArmId } : {}), classArm: { formTeacherId: ctx.session.userId, formTeacher: { isActive: true, role: 'TEACHER' } } }
}

export async function teacherFamilies(ctx: ScopedStaffContext, raw: z.infer<typeof teacherFamiliesSchema>) {
  const input = teacherFamiliesSchema.parse(raw)
  const placement = formTeacherScope(ctx, input.classArmId)
  const where: Prisma.ParentStudentWhereInput = { isActive: true, parent: { isActive: true }, student: {
    enrollments: { some: placement }, ...(input.search ? { OR: [{ fullName: { contains: input.search, mode: 'insensitive' } }, { regNumber: { contains: input.search.toUpperCase() } }] } : {}),
  } }
  const [families, total] = await Promise.all([
    ctx.db.parentStudent.findMany({ where, include: familyInclude, ...paginate(input), orderBy: [{ student: { fullName: 'asc' } }, { id: 'asc' }] }),
    ctx.db.parentStudent.count({ where }),
  ])
  return { families: families.map(familyDetails), meta: pageMeta(total, input) }
}

type CommentContext = ScopedParentContext | ScopedStaffContext
async function ownFamily(ctx: CommentContext, db: SchoolTransaction, parentStudentId: string) {
  const where: Prisma.ParentStudentWhereInput = 'parentId' in ctx.session
    ? parentScope(ctx as ScopedParentContext)
    : { isActive: true, parent: { isActive: true }, student: { enrollments: { some: formTeacherScope(ctx as ScopedStaffContext) } } }
  const family = await db.parentStudent.findFirst({ where: { ...where, id: parentStudentId }, include: familyInclude })
  if (!family) throw notFound('Parent and child conversation not found.')
  return familyDetails(family)
}

export async function listComments(ctx: CommentContext, raw: z.infer<typeof commentQuerySchema>) {
  const input = commentQuerySchema.parse(raw)
  const family = await ownFamily(ctx, ctx.db, input.parentStudentId)
  const where = { parentStudentId: family.parentStudentId }
  const [comments, total] = await Promise.all([
    ctx.db.parentComment.findMany({ where, ...paginate(input), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, body: true, author: true, createdAt: true, teacher: { select: { fullName: true } } } }),
    ctx.db.parentComment.count({ where }),
  ])
  return { family, comments: comments.reverse().map(({ teacher, ...comment }) => ({ ...comment, authorName: comment.author === 'PARENT' ? family.parent.fullName : teacher.fullName })), meta: pageMeta(total, input) }
}

export async function postComment(ctx: CommentContext, raw: z.infer<typeof commentSchema>) {
  const input = commentSchema.parse(raw)
  return schoolTransaction(ctx.db, async tx => {
    const family = await ownFamily(ctx, tx, input.parentStudentId)
    if (!family.formTeacher) throw conflict('A form teacher must be assigned to this child’s current class before comments can be sent.')
    return tx.parentComment.create({ data: {
      schoolId: ctx.schoolId, parentStudentId: family.parentStudentId, teacherId: family.formTeacher.id,
      author: ctx.session.typ === 'parent' ? 'PARENT' : 'TEACHER', body: input.body,
    }, select: { id: true } })
  })
}
