import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireStaff, requireStudent, type ScopedStaffContext, type StaffSession } from '@/lib/auth/session'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { tenantClient } from '@/lib/tenant'
import { SMS_SCHOOL_COOKIE, signSchoolScope, verifySchoolScope } from './school-scope-token'
import { SMS_CONTEXT_HEADER, smsContextKey } from './context-key'

export const selectSchoolSchema = z.object({ schoolId: z.string().trim().min(1).max(64) }).strict()

export type SmsAdministratorContext = ScopedStaffContext & {
  school: { id: string; name: string; isActive: boolean }
}

/** Shared by request handlers and the authenticated server-rendered SMS shell. */
export async function resolveSmsStaff(session: StaffSession, selection?: string): Promise<SmsAdministratorContext> {
  if (session.typ !== 'staff' || !session.userId || !['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'].includes(session.role)) {
    throw forbidden('Staff access required.')
  }
  let schoolId = session.schoolId
  if (session.role === 'SUPER_ADMIN') {
    if (!selection) throw conflict('Choose a school for SMS first.')
    schoolId = await verifySchoolScope(selection, session.userId)
  }
  if (!schoolId) throw forbidden('Your account is not attached to a school.')
  const db = tenantClient(schoolId)
  const school = await db.school.findFirst({ select: { id: true, name: true, isActive: true } })
  if (!school) throw notFound('School not found.')
  // Super Admin retains platform-wide management, including inactive schools.
  if (!school.isActive && session.role !== 'SUPER_ADMIN') throw forbidden('Your school is inactive.')
  return { session, schoolId: school.id, db, school }
}

export async function resolveSmsAdministrator(session: StaffSession, selection?: string) {
  if (session.role === 'TEACHER') throw forbidden('School administrator access required.')
  return resolveSmsStaff(session, selection)
}

export function checkRequestContext(req: NextRequest, userId: string, schoolId: string) {
  const expected = req.headers.get(SMS_CONTEXT_HEADER)
  if (expected && expected !== smsContextKey(userId, schoolId)) {
    throw conflict('Your school or account selection changed. Reload before continuing.', 'CONFLICT', { reason: 'SCHOOL_SCOPE_CHANGED' })
  }
}

export async function requireSmsStaff(req: NextRequest) {
  const session = await requireStaff(req)
  const context = await resolveSmsStaff(session, req.cookies.get(SMS_SCHOOL_COOKIE)?.value)
  checkRequestContext(req, session.userId, context.schoolId)
  return context
}

export async function requireSmsStudent(req: NextRequest) {
  const context = await requireStudent(req)
  const student = await context.db.student.findFirst({ where: { id: context.session.studentId }, select: {
    id: true, fullName: true, regNumber: true, classLevel: true, school: { select: { isActive: true } },
  } })
  if (!student || !student.school.isActive) throw forbidden('Student access is unavailable.')
  checkRequestContext(req, student.id, context.session.schoolId)
  return { ...context, schoolId: context.session.schoolId, student }
}

export async function requireSmsAdministrator(req: NextRequest): Promise<SmsAdministratorContext> {
  const session = await requireStaff(req, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
  const context = await resolveSmsAdministrator(session, req.cookies.get(SMS_SCHOOL_COOKIE)?.value)
  // Cookies are shared across tabs. A stale form must not be applied to a newly
  // selected school/account. This header can only reject a request, never grant scope.
  checkRequestContext(req, session.userId, context.schoolId)
  return context
}

/** The global administrator chooses a target; ordinary SMS data requests never accept schoolId. */
export async function selectSmsSchool(session: StaffSession, input: z.infer<typeof selectSchoolSchema>) {
  if (session.typ !== 'staff' || session.role !== 'SUPER_ADMIN' || !session.userId) {
    throw forbidden('Only Super Admin can select another school.')
  }
  const { schoolId } = selectSchoolSchema.parse(input)
  const school = await tenantClient(schoolId).school.findFirst({ select: { id: true, name: true, isActive: true } })
  if (!school) throw notFound('School not found.')
  return { school, token: await signSchoolScope(session.userId, school.id) }
}
