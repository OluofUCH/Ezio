import type { Metadata } from 'next'
import { ExamManager } from './ExamManager'

export const metadata: Metadata = { title: 'Manage exam' }

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params
  return <ExamManager examId={examId} />
}
