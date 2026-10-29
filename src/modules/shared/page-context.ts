import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getStaffContext, getStudentContext } from '@/lib/auth/rsc'
import { ApiError } from '@/lib/errors'
import { resolveSmsStaff } from './school-context'
import { SMS_SCHOOL_COOKIE } from './school-scope-token'

export const getSmsStaffPageContext = cache(async () => {
  const staff = await getStaffContext()
  if (!staff) redirect('/login?as=staff')
  const user = { ...staff.user, role: staff.user.role }
  const token = (await cookies()).get(SMS_SCHOOL_COOKIE)?.value
  try {
    const context = await resolveSmsStaff(staff.session, token)
    return { user, school: context.school }
  } catch (error) {
    if (user.role === 'SUPER_ADMIN' && error instanceof ApiError &&
        ['FORBIDDEN', 'CONFLICT', 'NOT_FOUND'].includes(error.code)) {
      return { user, school: null }
    }
    throw error
  }
})

export const getSmsPageContext = cache(async () => {
  const context = await getSmsStaffPageContext()
  if (context.user.role === 'TEACHER') redirect('/sms/staff')
  return context
})

export const getSmsStudentPageContext = cache(async () => {
  const context = await getStudentContext()
  if (!context) redirect('/login?as=student')
  return { user: { id: context.student.id, fullName: context.student.fullName, role: 'STUDENT' as const, regNumber: context.student.regNumber }, school: { id: context.school.id, name: context.school.name, isActive: true } }
})
