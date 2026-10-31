import type { ReactNode } from 'react'
import { getSmsParentPageContext } from '@/src/modules/shared/page-context'
import { SmsWorkspace } from '@/src/modules/shared/ui/SmsWorkspace'

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const { user, school } = await getSmsParentPageContext()
  return <SmsWorkspace key={`${user.id}:${school.id}`} user={user} initialSchool={school}>{children}</SmsWorkspace>
}
