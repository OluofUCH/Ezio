import type { Metadata } from 'next'
import { ExamResults } from './ExamResults'

export const metadata: Metadata = { title: 'Results & analytics' }

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  return <ExamResults examId={examId} />
}
