import { AdminConsole } from './pages/AdminConsole'
import { SetupWizard } from './pages/SetupWizard'
import { StudentPortal } from './pages/StudentPortal'

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '')

  if (path === '/setup') return <SetupWizard />
  if (path === '/admin') return <AdminConsole />
  return <StudentPortal />
}
