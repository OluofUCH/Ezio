import type { ScopedStaffContext } from '@/lib/auth/session'
import { forbidden } from '@/lib/errors'

/** A verified legacy staff context is required even when a service is called directly. */
export function assertStaffScope(context: Pick<ScopedStaffContext, 'session' | 'schoolId'>): void {
  const { session, schoolId } = context
  if (session.typ !== 'staff' || !session.userId || !schoolId) throw forbidden('Staff scope required.')
  if (session.role !== 'SUPER_ADMIN' && session.schoolId !== schoolId) {
    throw forbidden('The school does not match the authenticated staff account.')
  }
}

export function assertRosterManager(context: Pick<ScopedStaffContext, 'session' | 'schoolId'>): void {
  assertStaffScope(context)
  if (context.session.role !== 'SUPER_ADMIN' && context.session.role !== 'SCHOOL_ADMIN') {
    throw forbidden('Only a school administrator can modify the student roster.')
  }
}

export function assertSchoolAdministrator(context: Pick<ScopedStaffContext, 'session' | 'schoolId'>): void {
  assertStaffScope(context)
  if (context.session.role !== 'SUPER_ADMIN' && context.session.role !== 'SCHOOL_ADMIN') {
    throw forbidden('Only a school administrator can manage school setup.')
  }
}
