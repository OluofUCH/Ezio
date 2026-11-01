import type { Metadata } from 'next'
import { StaffDirectory } from './StaffDirectory'
import { getSmsPageContext } from '@/src/modules/shared/page-context'

export const metadata: Metadata = { title: 'Staff' }

export default async function Page() {
  await getSmsPageContext()
  return <StaffDirectory />
}
