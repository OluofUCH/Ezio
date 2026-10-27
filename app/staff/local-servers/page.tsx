import type { Metadata } from 'next'
import { LocalServers } from './LocalServers'

export const metadata: Metadata = { title: 'Local servers' }

export default function Page() {
  return <LocalServers />
}
