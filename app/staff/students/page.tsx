import type { Metadata } from 'next'
import { StudentRoster } from './StudentRoster'

export const metadata: Metadata = { title: 'Students' }

export default function Page() {
  return <StudentRoster />
}
