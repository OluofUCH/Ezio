import type { Metadata } from 'next'
import { StudentResultsList } from './StudentResultsList'

export const metadata: Metadata = { title: 'Results' }

export default function StudentResultsPage() {
  return <StudentResultsList />
}
