import { AppShell } from '@/components/shell/AppShell'
import { ScopeProvider } from '@/components/staff/ScopeProvider'
import { getSmsStaffPageContext } from '@/src/modules/shared/page-context'
import { portalNavigation } from '@/src/modules/shared/navigation'
import type { UserRole } from '@/lib/client/types'

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Platform Admin',
  SCHOOL_ADMIN: 'School Admin',
  TEACHER: 'Teacher',
}

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, school } = await getSmsStaffPageContext()

  return (
    <ScopeProvider
      key={`${user.id}:${school?.id ?? 'unselected'}`}
      role={user.role}
      school={school}
    >
      <AppShell
        nav={portalNavigation(user.role)}
        portalLabel={school?.name ?? 'School management'}
        userName={user.fullName}
        userMeta={`${ROLE_LABELS[user.role]} · ${user.email}`}
        logoutPath="/api/auth/staff/logout"
      >
        {children}
      </AppShell>
    </ScopeProvider>
  )
}
