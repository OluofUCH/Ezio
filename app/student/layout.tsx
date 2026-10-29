import { redirect } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { classLevelLabel } from '@/lib/client/format'
import { getStudentContext } from '@/lib/auth/rsc'
import { portalNavigation } from '@/src/modules/shared/navigation'

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
      nav={portalNavigation('STUDENT')}
      portalLabel={school.name}
      userName={student.fullName}
      userMeta={`${student.regNumber} · ${classLevelLabel(student.classLevel)}`}
      logoutPath="/api/auth/student/logout"
    >
      {children}
    </AppShell>
  )
}
