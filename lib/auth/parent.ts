import type { NextRequest } from 'next/server'
import { forbidden, unauthenticated } from '@/lib/errors'
import { tenantClient, type TenantDb } from '@/lib/tenant'
import { PARENT_COOKIE, readToken } from './cookies'
import { verifyToken, type ParentTokenPayload } from './jwt'

export type ScopedParentContext = {
  session: { typ: 'parent'; parentId: string; schoolId: string; authVersion: number }
  schoolId: string
  db: TenantDb
}

export async function resolveParentSession(payload: ParentTokenPayload) {
  const db = tenantClient(payload.schoolId)
  const parent = await db.parent.findFirst({ where: { id: payload.sub }, select: {
    id: true, fullName: true, phone: true, isActive: true, authVersion: true,
    school: { select: { id: true, name: true, slug: true, logoUrl: true, isActive: true } },
  } })
  if (!parent) throw unauthenticated('Parent authentication required.')
  if (!parent.isActive || !parent.school.isActive) throw forbidden('Parent access is unavailable. Contact your school administrator.')
  if (parent.authVersion !== payload.authVersion) throw unauthenticated('Your sign-in details changed. Please sign in again.')
  return {
    db, schoolId: payload.schoolId,
    session: { typ: 'parent' as const, parentId: parent.id, schoolId: payload.schoolId, authVersion: parent.authVersion },
    parent: { id: parent.id, fullName: parent.fullName, phone: parent.phone }, school: parent.school,
  }
}

export async function requireParent(req: NextRequest) {
  const token = readToken(req, PARENT_COOKIE)
  if (!token) throw unauthenticated('Parent authentication required.')
  const payload = await verifyToken(token)
  if (payload.typ !== 'parent') throw unauthenticated('This endpoint requires a parent session.')
  return resolveParentSession(payload)
}
