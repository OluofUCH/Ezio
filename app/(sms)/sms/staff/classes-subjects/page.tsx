import type { Metadata } from 'next'
import { StructureScreen } from '@/src/modules/school-setup/ui/StructureScreen'
import { getSmsPageContext } from '@/src/modules/shared/page-context'

export const metadata: Metadata = { title: 'Classes & subjects' }

export default async function ClassSubjectSetupPage() {
  await getSmsPageContext()
  return <StructureScreen />
}
