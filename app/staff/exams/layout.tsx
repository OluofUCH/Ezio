import type { ReactNode } from 'react'
import { getSmsStaffPageContext } from '@/src/modules/shared/page-context'

export default async function Layout({ children }: { children: ReactNode }) {
  await getSmsStaffPageContext()
  return children
}
