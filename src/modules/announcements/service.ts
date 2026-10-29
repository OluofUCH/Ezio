import { z } from 'zod'
import type { ScopedStaffContext } from '@/lib/auth/session'
import { forbidden, notFound } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { isSchoolAdmin } from '@/src/modules/shared/access'

export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(10000),
  audience: z.enum(['ALL_STAFF', 'ROLE', 'CLASS_ARM']), targetRole: z.enum(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER']).nullable().optional(), classArmId: idSchema.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.audience === 'ROLE') !== Boolean(value.targetRole) || (value.audience === 'CLASS_ARM') !== Boolean(value.classArmId)) ctx.addIssue({ code: 'custom', message: 'Choose exactly the target required by the audience.' })
})

async function staffFilter(ctx: ScopedStaffContext) {
  if (ctx.session.typ !== 'staff') throw forbidden('Staff authentication required.')
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
