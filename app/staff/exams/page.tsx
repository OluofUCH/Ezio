import type { Metadata } from 'next'
import { StaffExamsList } from './StaffExamsList'

export const metadata: Metadata = { title: 'Exams' }

export default function StaffExamsPage() {
  return <StaffExamsList />
}
