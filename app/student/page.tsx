import type { Metadata } from 'next'
import { StudentDashboard } from './StudentDashboard'

export const metadata: Metadata = { title: 'Dashboard' }

export default function StudentDashboardPage() {
  return <StudentDashboard />
}
