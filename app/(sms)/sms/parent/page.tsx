import { getSmsParentPageContext } from '@/src/modules/shared/page-context'
import { ParentResultsScreen } from '@/src/modules/parents/ui/ParentScreens'
export default async function Page() {
  await getSmsParentPageContext()
  return <ParentResultsScreen />
}
