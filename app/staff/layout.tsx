import { redirect } from 'next/navigation'
import { AppShell, type NavItem } from '@/components/shell/AppShell'
import { ScopeProvider } from '@/components/staff/ScopeProvider'
import { getStaffContext } from '@/lib/auth/rsc'
import type { UserRole } from '@/lib/client/types'

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Platform Admin',
  SCHOOL_ADMIN: 'School Admin',
  TEACHER: 'Teacher',
}

/**
 * Navigation is built from the role rather than rendered in full and disabled, so a
 * teacher is never shown a Local Servers link that would 403 — the endpoint refuses them
 * (`canManageSchool`), and a visible dead end reads as a broken app.
 */
function navFor(role: UserRole): NavItem[] {
  const shared: NavItem[] = [
    { href: '/staff', label: 'Dashboard', icon: 'dashboard' },
    { href: '/staff/exams', label: 'Exams', icon: 'quiz' },
    { href: '/staff/students', label: 'Students', icon: 'group' },
  ]

  // Every role manages their own password, so this is last in the shared set rather
  // than gated — a teacher needs it exactly as much as an admin does.
  const account: NavItem = { href: '/staff/account', label: 'My account', icon: 'manage_accounts' }

  if (role === 'TEACHER') return [...shared, account]

  return [
    ...shared,
    { href: '/staff/teachers', label: 'Staff', icon: 'school' },
    { href: '/staff/local-servers', label: 'Local Servers', icon: 'dns' },
    ...(role === 'SUPER_ADMIN'
      ? [{ href: '/staff/schools', label: 'Schools', icon: 'apartment' }]
      : []),
    account,
  ]
}

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const context = await getStaffContext()

  // The cookie exists (middleware checked) but resolves to nothing usable: expired token,
  // deleted account, deactivated user, or a school switched inactive.
  if (!context) redirect('/login?as=staff')

  const { user, school } = context

  return (
    <ScopeProvider
      role={user.role}
      ownSchoolId={school?.id ?? null}
      ownSchoolName={school?.name ?? null}
    >
      <AppShell
        nav={navFor(user.role)}
        portalLabel={school?.name ?? ROLE_LABELS[user.role]}
        userName={user.fullName}
        userMeta={`${ROLE_LABELS[user.role]} · ${user.email}`}
        logoutPath="/api/auth/staff/logout"
        primaryAction={
          // Super admins create exams inside a chosen school, so the shortcut would be
          // ambiguous before they have picked one.
          user.role === 'SUPER_ADMIN'
            ? undefined
            : { label: 'Create exam', href: '/staff/exams/new', icon: 'add' }
        }
      >
        {children}
      </AppShell>
    </ScopeProvider>
  )
}
