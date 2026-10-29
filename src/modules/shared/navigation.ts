import type { UserRole } from '@/lib/client/types'

export type PortalRole = UserRole | 'STUDENT'
export type NavLink = { href: string; label: string; icon: string; exact?: boolean }
export type NavGroup = { id: string; label: string; icon: string; children: NavLink[] }
export type NavItem = NavLink | NavGroup

export function portalHome(role: PortalRole) {
  return role === 'STUDENT' ? '/sms/student' : '/sms/staff'
}

export function isNavLinkActive(pathname: string, item: NavLink) {
  return pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`))
}

/** SMS is the shared workspace; CBT is one module inside its navigation. */
export function portalNavigation(role: PortalRole): NavItem[] {
  const home: NavLink = { href: portalHome(role), label: 'School dashboard', icon: 'dashboard', exact: true }
  if (role === 'STUDENT') {
    return [home, {
      id: 'cbt', label: 'CBT', icon: 'quiz', children: [
        { href: '/student', label: 'Overview', icon: 'space_dashboard', exact: true },
        { href: '/student/exams', label: 'My exams', icon: 'quiz' },
        { href: '/student/results', label: 'Exam results', icon: 'assessment' },
      ],
    }]
  }

  const admin = role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN'
  return [
    home,
    {
      id: 'cbt', label: 'CBT', icon: 'quiz', children: [
        { href: '/staff', label: 'Overview', icon: 'space_dashboard', exact: true },
        { href: '/staff/exams', label: 'Exams', icon: 'quiz' },
        { href: '/staff/students', label: 'Candidates', icon: 'group' },
        ...(admin ? [{ href: '/staff/local-servers', label: 'Hall servers', icon: 'dns' }] : []),
        { href: '/sms/staff/bridge', label: 'Import CBT scores', icon: 'sync' },
      ],
    },
    ...(role === 'SUPER_ADMIN' ? [{ href: '/staff/schools', label: 'Schools', icon: 'apartment' }] : []),
    ...(admin ? [
      { href: '/sms/staff/calendar', label: 'Academic calendar', icon: 'calendar_month' },
      { href: '/sms/staff/classes-subjects', label: 'Classes & subjects', icon: 'category' },
      { href: '/sms/staff/teachers', label: 'Staff & assignments', icon: 'badge' },
      { href: '/staff/teachers', label: 'Staff accounts', icon: 'manage_accounts' },
      { href: '/sms/staff/students', label: 'Students', icon: 'group' },
      { href: '/sms/staff/assessment', label: 'Assessment setup', icon: 'settings' },
    ] : []),
    { href: '/sms/staff/attendance', label: 'Attendance', icon: 'fact_check' },
    { href: '/sms/staff/scores', label: 'Score entry', icon: 'edit_note' },
    { href: '/sms/staff/reports', label: 'Report cards', icon: 'description' },
    { href: '/sms/staff/announcements', label: 'Staff notices', icon: 'campaign' },
    { href: '/staff/account', label: 'My account', icon: 'manage_accounts' },
  ]
}
