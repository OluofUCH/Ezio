import type { Metadata } from 'next'
import { ExamRunner } from './ExamRunner'

export const metadata: Metadata = {
  title: 'Exam in progress',
  // Keep a paper out of history/prefetch caches on a shared lab machine.
  robots: { index: false, follow: false },
}

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  return <ExamRunner examId={examId} />
}
