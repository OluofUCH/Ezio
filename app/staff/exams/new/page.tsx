import type { Metadata } from 'next'
import { NewExamPage } from './NewExamPage'

export const metadata: Metadata = { title: 'Create exam' }

export default function Page() {
  return <NewExamPage />
}
