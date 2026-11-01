import type { Metadata } from 'next'
import { StaffDashboard } from './StaffDashboard'
import { getSmsStaffPageContext } from '@/src/modules/shared/page-context'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function StaffDashboardPage() {
  await getSmsStaffPageContext()
  return <StaffDashboard />
}
