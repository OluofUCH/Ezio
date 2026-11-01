import type { Metadata } from 'next'
import { LocalServers } from './LocalServers'
import { getSmsPageContext } from '@/src/modules/shared/page-context'

export const metadata: Metadata = { title: 'Local servers' }

export default async function Page() {
  await getSmsPageContext()
  return <LocalServers />
}
