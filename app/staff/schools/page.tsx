import type { Metadata } from 'next'
import { SchoolsAdmin } from './SchoolsAdmin'

export const metadata: Metadata = { title: 'Schools' }

export default function Page() {
  return <SchoolsAdmin />
}
