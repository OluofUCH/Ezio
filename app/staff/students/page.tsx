import type { Metadata } from 'next'
import { StudentRoster } from './StudentRoster'
import { getSmsStaffPageContext } from '@/src/modules/shared/page-context'

export const metadata: Metadata = { title: 'Students' }

export default async function Page() {
  await getSmsStaffPageContext()
  return <StudentRoster />
}
