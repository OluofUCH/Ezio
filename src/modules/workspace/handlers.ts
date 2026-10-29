import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ok, created, readJson, readQuery, readUpload } from '@/lib/api'
import { notFound, forbidden } from '@/lib/errors'
import { idSchema } from '@/lib/validation/common'
import { requireSmsStaff, requireSmsStudent } from '@/src/modules/shared/school-context'
import { assertSchoolAdministrator } from '@/src/modules/shared/authorization'
import { assertArmAccess, ownTerm, isSchoolAdmin } from '@/src/modules/shared/access'
import * as students from '@/src/modules/students/management'
import { importStudentRoster } from '@/src/modules/students/import'
import * as attendance from '@/src/modules/attendance/service'
import * as results from '@/src/modules/results/service'
import { assessmentSchema } from '@/src/modules/results/rules'
import { reportPdf } from '@/src/modules/results/pdf'
import * as bridge from '@/src/modules/cbt-results/service'
import * as announcements from '@/src/modules/announcements/service'
import { staffLookups, staffDashboard, studentDashboard } from '@/src/modules/dashboards/service'

const armTerm = z.object({ classArmId: idSchema, termId: idSchema }).strict()
const bodySchema = z.object({ op: z.string().optional() }).passthrough()
const pdfResponse = (data: Uint8Array, id: string) => new NextResponse(new Uint8Array(data), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="report-${id.replace(/[^a-z0-9_-]/gi, '')}.pdf"`, 'cache-control': 'private, no-store' } })

export async function staffWorkspaceGet(req: NextRequest, area: string) {
  const ctx = await requireSmsStaff(req)
  const param = (name: string) => idSchema.parse(req.nextUrl.searchParams.get(name))
  switch (area) {
    case 'lookups': return ok({ schoolId: ctx.schoolId, ...await staffLookups(ctx) })
    case 'dashboard': return ok({ schoolId: ctx.schoolId, ...await staffDashboard(ctx) })
    case 'students': return ok({ schoolId: ctx.schoolId, ...await students.listManagedStudents(ctx, readQuery(req, students.studentListSchema)) })
    case 'attendance': return ok(await attendance.getRoll(ctx, readQuery(req, attendance.rollQuerySchema)))
    case 'assessment': return ok(await results.assessmentSettings(ctx))
    case 'scores': return ok(await results.scoreSheet(ctx, readQuery(req, results.groupSchema)))
    case 'reports': { const query = readQuery(req, armTerm); return ok({ reports: await results.listReports(ctx, query.classArmId, query.termId) }) }
    case 'submissions': {
      const term = await ownTerm(ctx.db, param('termId'))
      const assigned = isSchoolAdmin(ctx.session.role) ? null : await ctx.db.teachingAssignment.findMany({ where: { teacherId: ctx.session.userId, academicSessionId: term.academicSessionId, isActive: true }, select: { classArmId: true, subjectId: true } })
      return ok({ submissions: await ctx.db.resultSubmission.findMany({ where: { termId: term.id, ...(assigned ? { OR: assigned.length ? assigned : [{ id: '__none__' }] } : {}) }, include: { subject: true, classArm: true }, orderBy: { updatedAt: 'desc' } }) })
    }
    case 'audit': {
      assertSchoolAdministrator(ctx)
      return ok({ audits: await ctx.db.scoreAuditLog.findMany({ where: { scoreId: param('scoreId') }, include: { actor: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }) })
    }
    case 'bridge': return ok({ exams: await bridge.bridgeExams(ctx) })
    case 'announcements': return ok({ announcements: await announcements.listAnnouncements(ctx, req.nextUrl.searchParams.has('id') ? param('id') : undefined) })
    case 'photo': {
      const studentId = param('studentId')
      if (!isSchoolAdmin(ctx.session.role)) {
        const enrollment = await ctx.db.enrollment.findFirst({ where: { studentId, isCurrent: true } })
        if (!enrollment) throw notFound('Student not found.')
        await assertArmAccess(ctx, enrollment.classArmId, enrollment.academicSessionId)
      }
      const photo = await ctx.db.studentPhoto.findFirst({ where: { studentId }, select: { data: true, mimeType: true } })
      if (!photo) throw notFound('Photo not found.')
      return new NextResponse(photo.data, { headers: { 'content-type': photo.mimeType, 'cache-control': 'private, no-store' } })
    }
    case 'report-pdf': {
      const report = await ctx.db.reportCard.findFirst({ where: { id: param('id') } })
      if (!report) throw notFound('Report not found.')
      const term = await ownTerm(ctx.db, report.termId)
      await assertArmAccess(ctx, report.classArmId, term.academicSessionId)
      return pdfResponse(await reportPdf(ctx.db, report), report.id)
    }
    default: throw notFound('SMS endpoint not found.')
  }
}

export async function staffWorkspacePost(req: NextRequest, area: string) {
  const ctx = await requireSmsStaff(req)
  if (area === 'students-import') return importStudentRoster(req, ctx)
  if (area === 'photo') {
    assertSchoolAdministrator(ctx)
    const studentId = idSchema.parse(req.nextUrl.searchParams.get('studentId'))
    const file = await readUpload(req, 'file', { allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'], maxBytes: 2 * 1024 * 1024 })
    return ok(await students.saveStudentPhoto(ctx, studentId, file.buffer))
  }
  const { op, ...input } = await readJson(req, bodySchema)
  switch (area) {
    case 'students': {
      if (op === 'update') { const { studentId, ...data } = input; return ok(await students.updateManagedStudent(ctx, idSchema.parse(studentId), students.studentProfileSchema.parse(data))) }
      return created({ student: await students.createManagedStudent(ctx, students.managedStudentSchema.parse(input)) })
    }
    case 'enrollments': return ok(op === 'activate' ? await students.activateAcademicSession(ctx, idSchema.parse(input.academicSessionId)) : await students.changeEnrollment(ctx, students.transitionSchema.parse(input)))
    case 'attendance': return ok(await attendance.markAttendance(ctx, attendance.markAttendanceSchema.parse(input)))
    case 'assessment': return ok(await results.saveAssessment(ctx, assessmentSchema.parse(input)))
    case 'scores': return ok(op === 'transition' ? await results.transitionResults(ctx, results.transitionResultSchema.parse(input)) : await results.saveScores(ctx, results.scoreInputSchema.parse(input)))
    case 'reports': return ok(op === 'publish' ? await results.publishReports(ctx, results.publishSchema.parse(input)) : await results.saveRemarks(ctx, results.remarkSchema.parse(input)))
    case 'bridge': return ok(op === 'link' ? await bridge.linkExam(ctx, bridge.linkExamSchema.parse(input)) : await bridge.importCbtScores(ctx, bridge.importCbtSchema.parse(input)))
    case 'announcements': return created({ announcement: await announcements.postAnnouncement(ctx, announcements.announcementSchema.parse(input)) })
    default: throw notFound('SMS action not found.')
  }
}

export async function studentWorkspaceGet(req: NextRequest, area: string) {
  const ctx = await requireSmsStudent(req)
  switch (area) {
    case 'dashboard': return ok(await studentDashboard(ctx.db, ctx.session.studentId))
    case 'reports': return ok({ reports: await results.ownReports(ctx.db, ctx.session.studentId) })
    case 'attendance': return ok(await attendance.studentAttendance(ctx.db, ctx.session.studentId))
    case 'announcements': throw forbidden('Announcements are available only to staff.')
    case 'report-pdf': {
      const report = await ctx.db.reportCard.findFirst({ where: { id: idSchema.parse(req.nextUrl.searchParams.get('id')), status: 'PUBLISHED', enrollment: { studentId: ctx.session.studentId } } })
      if (!report) throw notFound('Published report not found.')
      return pdfResponse(await reportPdf(ctx.db, report), report.id)
    }
    default: throw notFound('Student endpoint not found.')
  }
}
