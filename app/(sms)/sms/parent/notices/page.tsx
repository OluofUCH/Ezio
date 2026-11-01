import { getSmsParentPageContext } from '@/src/modules/shared/page-context'
import { ParentNoticesScreen } from '@/src/modules/announcements/ui/AnnouncementsScreen'
export default async function Page() {
  await getSmsParentPageContext()
  return <ParentNoticesScreen />
}
