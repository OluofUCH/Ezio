import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getStaffContext } from '@/lib/auth/rsc'
import { AccountSettings } from './AccountSettings'

export const metadata: Metadata = { title: 'My account' }

export default async function Page() {
  const context = await getStaffContext()
  if (!context) redirect('/login?as=staff')

  const { user, school } = context

  return (
    <AccountSettings
      fullName={user.fullName}
      email={user.email}
      role={user.role}
      schoolName={school?.name ?? null}
    />
  )
}
