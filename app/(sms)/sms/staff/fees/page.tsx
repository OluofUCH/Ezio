import { getSmsStaffPageContext } from '@/src/modules/shared/page-context'
import { FeesScreen } from '@/src/modules/fees/ui/FeesScreen'
export default async function Page() {
  await getSmsStaffPageContext()
  return <FeesScreen />
}
