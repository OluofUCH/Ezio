import { getSmsPageContext } from '@/src/modules/shared/page-context'
import { StudentsScreen } from '@/src/modules/workspace/ui/Screens'
export default async function Page(){await getSmsPageContext();return <StudentsScreen/>}
