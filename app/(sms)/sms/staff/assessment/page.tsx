import { getSmsPageContext } from '@/src/modules/shared/page-context'
import { AssessmentScreen } from '@/src/modules/results/ui/AssessmentScreen'
export default async function Page(){await getSmsPageContext();return <AssessmentScreen/>}
