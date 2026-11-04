import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getStaffContext, getStudentContext, getParentContext } from '@/lib/auth/rsc'
import { resolveSmsStaff } from './school-context'
import { portalHome } from './navigation'

export const getStaffPageContext = cache(async () => {
  const staff = await getStaffContext()
  if (!staff) redirect('/login?as=staff')
  const isFormTeacher = staff.user.role === 'TEACHER' && Boolean(await staff.db?.classArm.findFirst({
    where: { formTeacherId: staff.user.id }, select: { id: true },
  }))
  return { ...staff, isFormTeacher }
})

export const getPlatformPageContext = cache(async () => {
  const context = await getStaffPageContext()
  if (context.user.role !== 'SUPER_ADMIN') redirect(portalHome(context.user.role))
  return context
})

export const getSmsStaffPageContext = cache(async () => {
  const staff = await getStaffPageContext()
  if (staff.user.role === 'SUPER_ADMIN') redirect(portalHome(staff.user.role))
  const context = await resolveSmsStaff(staff.session)
  return { user: staff.user, school: { ...context.school, logoUrl: staff.school?.logoUrl ?? null }, isFormTeacher: staff.isFormTeacher }
})

export const getSmsPageContext = cache(async () => {
  const context = await getSmsStaffPageContext()
  if (context.user.role === 'TEACHER') redirect('/sms/staff')
  return context
})

export const getSmsAdmissionsPageContext = cache(async () => {
  const context = await getSmsStaffPageContext()
  if (context.user.role === 'TEACHER' && !context.isFormTeacher) redirect('/sms/staff')
  return context
})

export const getSmsStudentPageContext = cache(async () => {
  const context = await getStudentContext()
  if (!context) redirect('/login?as=student')
  return { user: { id: context.student.id, fullName: context.student.fullName, role: 'STUDENT' as const, regNumber: context.student.regNumber }, school: { id: context.school.id, name: context.school.name, logoUrl: context.school.logoUrl, isActive: true } }
})

export const getSmsParentPageContext = cache(async () => {
  const context = await getParentContext()
  if (!context) redirect('/login?as=parent')
  return { user: { ...context.parent, role: 'PARENT' as const }, school: context.school }
})
