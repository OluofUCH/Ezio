import { getSmsPageContext } from '@/src/modules/shared/page-context'
import { ParentAccountsScreen } from '@/src/modules/parents/ui/ParentAccountsScreen'
export default async function Page() {
  await getSmsPageContext()
  return <ParentAccountsScreen />
}
