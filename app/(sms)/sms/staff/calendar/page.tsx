import type { Metadata } from 'next'
import { CalendarScreen } from '@/src/modules/school-setup/ui/CalendarScreen'
import { getSmsPageContext } from '@/src/modules/shared/page-context'

export const metadata: Metadata = { title: 'Academic calendar' }

export default async function AcademicCalendarPage() {
  await getSmsPageContext()
  return <CalendarScreen />
}
