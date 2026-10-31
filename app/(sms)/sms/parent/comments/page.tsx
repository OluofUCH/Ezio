import { getSmsParentPageContext } from '@/src/modules/shared/page-context'
import { ParentCommentsScreen } from '@/src/modules/parents/ui/ParentScreens'
export default async function Page({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await getSmsParentPageContext()
  return <ParentCommentsScreen initialChildId={(await searchParams).child} />
}
