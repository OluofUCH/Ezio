import type { Metadata } from 'next'
import { SchoolsAdmin } from './SchoolsAdmin'
import { getPlatformPageContext } from '@/src/modules/shared/page-context'

export const metadata: Metadata = { title: 'Schools' }

export default async function Page() {
  await getPlatformPageContext()
  return <SchoolsAdmin />
}
