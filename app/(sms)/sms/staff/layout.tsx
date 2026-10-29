import type { ReactNode } from 'react'
import { getSmsStaffPageContext } from '@/src/modules/shared/page-context'
import { SmsWorkspace } from '@/src/modules/shared/ui/SmsWorkspace'

export default async function SmsStaffLayout({ children }: { children: ReactNode }) {
  const { user, school } = await getSmsStaffPageContext()
  return <SmsWorkspace key={`${user.id}:${user.role}:${school?.id ?? 'unselected'}`} user={user} initialSchool={school}>{children}</SmsWorkspace>
}
