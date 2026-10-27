import type { Metadata } from 'next'
import { StudentExamsList } from './StudentExamsList'

export const metadata: Metadata = { title: 'My Exams' }

export default function StudentExamsPage() {
  return <StudentExamsList />
}
