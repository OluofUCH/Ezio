import type { Metadata } from 'next'
import { StaffDirectory } from './StaffDirectory'

export const metadata: Metadata = { title: 'Staff' }

export default function Page() {
  return <StaffDirectory />
}
