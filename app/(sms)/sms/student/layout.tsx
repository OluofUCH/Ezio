import type { ReactNode } from 'react'
import { getSmsStudentPageContext } from '@/src/modules/shared/page-context'
import { SmsWorkspace } from '@/src/modules/shared/ui/SmsWorkspace'
export default async function Layout({children}:{children:ReactNode}){const {user,school}=await getSmsStudentPageContext();return <SmsWorkspace user={user} initialSchool={school}>{children}</SmsWorkspace>}
