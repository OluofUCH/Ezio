import { redirect } from 'next/navigation'
import { getSmsStaffPageContext } from '@/src/modules/shared/page-context'
import { TeacherCommentsScreen } from '@/src/modules/parents/ui/TeacherCommentsScreen'
export default async function Page() {
  const { user } = await getSmsStaffPageContext()
  if (user.role !== 'TEACHER') redirect('/sms/staff')
  return <TeacherCommentsScreen />
}
