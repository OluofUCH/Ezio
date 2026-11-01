import { z } from 'zod'
import type { ScopedStaffContext } from '@/lib/auth/session'
import type { ScopedParentContext } from '@/lib/auth/parent'
import { forbidden, notFound } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { assertSchoolAdministrator, assertStaffScope } from '@/src/modules/shared/authorization'
import { isSchoolAdmin } from '@/src/modules/shared/access'
import { ANNOUNCEMENT_AUDIENCES, needsClassArm } from './audiences'

export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(10000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES), targetRole: z.enum(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER']).nullable().optional(), classArmId: idSchema.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.audience === 'ROLE') !== Boolean(value.targetRole) || needsClassArm(value.audience) !== Boolean(value.classArmId)) ctx.addIssue({ code: 'custom', message: 'Choose exactly the target required by the audience.' })
})

async function staffFilter(ctx: ScopedStaffContext) {
  assertStaffScope(ctx)
  if (isSchoolAdmin(ctx.session.role)) return {}
  const arms = await ctx.db.classArm.findMany({ where: { OR: [
    { formTeacherId: ctx.session.userId },
    { teachingAssignments: { some: { teacherId: ctx.session.userId, isActive: true, academicSession: { isCurrent: true } } } },
  ] }, select: { id: true } })
  return { OR: [{ audience: 'ALL_STAFF' as const }, { audience: 'ROLE' as const, targetRole: ctx.session.role }, { audience: 'CLASS_ARM' as const, classArmId: { in: arms.map((a) => a.id) } }] }
}

export async function listAnnouncements(ctx: ScopedStaffContext, id?: string) {
  const where = { ...await staffFilter(ctx), ...(id ? { id } : {}) }
  const announcements = await ctx.db.announcement.findMany({ where, include: { author: { select: { fullName: true } }, classArm: { select: { level: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
  if (id && !announcements.length) throw notFound('Announcement not found.')
  return announcements
}

export async function postAnnouncement(ctx: ScopedStaffContext, raw: z.infer<typeof announcementSchema>) {
  assertSchoolAdministrator(ctx)
  const input = announcementSchema.parse(raw)
  if (input.classArmId && !await ctx.db.classArm.findFirst({ where: { id: input.classArmId }, select: { id: true } })) throw notFound('Class arm not found.')
  return ctx.db.announcement.create({ data: { schoolId: ctx.schoolId, title: input.title, body: input.body, audience: input.audience, targetRole: input.targetRole ?? null, classArmId: input.classArmId ?? null, authorId: ctx.session.userId } })
}

export async function listParentAnnouncements(ctx: ScopedParentContext, id?: string) {
  if (ctx.session.typ !== 'parent' || ctx.session.schoolId !== ctx.schoolId) throw forbidden('Parent access required.')
  const parent = await ctx.db.parent.findFirst({ where: { id: ctx.session.parentId, isActive: true, authVersion: ctx.session.authVersion }, select: { id: true } })
  if (!parent) throw forbidden('Parent access is unavailable.')
  const enrollments = await ctx.db.enrollment.findMany({ where: {
    isCurrent: true, status: 'ACTIVE', academicSession: { isCurrent: true },
    student: { parents: { some: { parentId: parent.id, isActive: true } } },
  }, select: { classArmId: true } })
  const announcements = await ctx.db.announcement.findMany({ where: {
    ...(id ? { id: idSchema.parse(id) } : {}),
    OR: [{ audience: 'ALL_PARENTS' }, { audience: 'PARENT_CLASS_ARM', classArmId: { in: [...new Set(enrollments.map(row => row.classArmId))] } }],
  }, include: { author: { select: { fullName: true } }, classArm: { select: { level: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 })
  if (id && !announcements.length) throw notFound('Notice not found.')
  return announcements
}
