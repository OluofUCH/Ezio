import type { NextRequest } from 'next/server'
import { requireStaff, requireStudent, type ScopedStaffContext, type StaffSession } from '@/lib/auth/session'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { tenantClient } from '@/lib/tenant'
import { SMS_CONTEXT_HEADER, smsContextKey } from './context-key'
import { requireParent } from '@/lib/auth/parent'

export type SmsAdministratorContext = ScopedStaffContext & {
  school: { id: string; name: string; isActive: boolean }
}

/** Shared by request handlers and the authenticated server-rendered SMS shell. */
export async function resolveSmsStaff(session: StaffSession): Promise<SmsAdministratorContext> {
  if (session.typ !== 'staff' || !session.userId || !['SCHOOL_ADMIN', 'TEACHER'].includes(session.role)) {
    throw forbidden('School staff access required. Platform administrators cannot access school operations.')
  }
  const schoolId = session.schoolId
  if (!schoolId) throw forbidden('Your account is not attached to a school.')
  const db = tenantClient(schoolId)
  const school = await db.school.findFirst({ select: { id: true, name: true, isActive: true } })
  if (!school) throw notFound('School not found.')
  if (!school.isActive) throw forbidden('Your school is paused.')
  return { session, schoolId: school.id, db, school }
}

export async function resolveSmsAdministrator(session: StaffSession) {
  if (session.role !== 'SCHOOL_ADMIN') throw forbidden('School administrator access required.')
  return resolveSmsStaff(session)
}

export function checkRequestContext(req: NextRequest, userId: string, schoolId: string) {
  const expected = req.headers.get(SMS_CONTEXT_HEADER)
  if (expected && expected !== smsContextKey(userId, schoolId)) {
    throw conflict('Your school or account selection changed. Reload before continuing.', 'CONFLICT', { reason: 'SCHOOL_SCOPE_CHANGED' })
  }
}

export async function requireSmsStaff(req: NextRequest) {
  const session = await requireStaff(req, ['SCHOOL_ADMIN', 'TEACHER'])
  const context = await resolveSmsStaff(session)
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

export async function requireSmsParent(req: NextRequest) {
  const context = await requireParent(req)
  checkRequestContext(req, context.parent.id, context.schoolId)
  return context
}

export async function requireSmsAdministrator(req: NextRequest): Promise<SmsAdministratorContext> {
  const session = await requireStaff(req, ['SCHOOL_ADMIN'])
  const context = await resolveSmsAdministrator(session)
  // Cookies are shared across tabs. A stale form must not be applied to a different
  // signed-in account. This header can only reject a request, never grant scope.
  checkRequestContext(req, session.userId, context.schoolId)
  return context
}
