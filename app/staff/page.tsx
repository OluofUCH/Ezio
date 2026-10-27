import type { Metadata } from 'next'
import { StaffDashboard } from './StaffDashboard'

export const metadata: Metadata = { title: 'Dashboard' }

export default function StaffDashboardPage() {
  return <StaffDashboard />
}
