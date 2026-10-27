import { redirect } from 'next/navigation'
import { AppShell, type NavItem } from '@/components/shell/AppShell'
import { classLevelLabel } from '@/lib/client/format'
import { getStudentContext } from '@/lib/auth/rsc'

const STUDENT_NAV: NavItem[] = [
  { href: '/student', label: 'Dashboard', icon: 'dashboard' },
  { href: '/student/exams', label: 'My Exams', icon: 'quiz' },
  { href: '/student/results', label: 'Results', icon: 'assessment' },
]

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const context = await getStudentContext()

  /**
   * The middleware already bounced anyone with no cookie, so reaching this branch means
   * the cookie exists but the session behind it does not resolve — an expired token, a
   * deleted roster entry, or a school switched inactive. Re-checking here rather than
   * trusting the middleware is what makes a stale cookie fail closed.
   */
  if (!context) redirect('/login?as=student')

  const { student, school } = context

  return (
    <AppShell
      nav={STUDENT_NAV}
      portalLabel={school.name}
      userName={student.fullName}
      userMeta={`${student.regNumber} · ${classLevelLabel(student.classLevel)}`}
      logoutPath="/api/auth/student/logout"
    >
      {children}
    </AppShell>
  )
}
