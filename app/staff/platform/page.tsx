import type { Metadata } from 'next'
import { getPlatformPageContext } from '@/src/modules/shared/page-context'
import { PlatformDashboardScreen } from '@/src/modules/platform/ui/PlatformDashboardScreen'

export const metadata: Metadata = { title: 'Platform dashboard' }

export default async function Page() {
  await getPlatformPageContext()
  return <PlatformDashboardScreen />
}
