'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { useScope } from '@/components/staff/ScopeProvider'

/**
 * Blocks a school-scoped page until a super admin has chosen which school to act on.
 *
 * Without this the page would fetch with no `?schoolId=` and `requireSchoolScope` would
 * answer 403 with a developer-facing message about adding a query parameter. Naming the
 * missing decision is the honest version of the same refusal.
 */
export function SchoolGate({ children }: { children: React.ReactNode }) {
  const { needsSchoolChoice } = useScope()

  if (!needsSchoolChoice) return <>{children}</>

  return (
    <div className="card">
      <EmptyState
        icon="apartment"
        title="Choose a school first"
        description="Your account sits above every tenant, so school data has to be requested for one school at a time. Pick one to continue — you can switch at any point."
        action={
          <Link href="/staff/schools" className="btn-primary">
            <Icon name="list" size={20} />
            Browse schools
          </Link>
        }
      />
    </div>
  )
}

/** A small "acting on <school>" indicator with a switch link, for super admins. */
export function ActiveSchoolBanner() {
  const { isSuperAdmin, schoolId, activeSchoolName } = useScope()

  if (!isSuperAdmin || !schoolId) return null

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-secondary-fixed-dim bg-secondary-fixed/40 px-4 py-3">
      <p className="flex items-center gap-2 font-label-md text-label-md text-on-secondary-fixed">
        <Icon name="visibility" size={18} />
        Viewing <strong>{activeSchoolName ?? schoolId}</strong> as platform admin
      </p>
      <Link
        href="/staff/schools"
        className="shrink-0 font-label-md text-label-md text-on-secondary-fixed underline hover:no-underline"
      >
        Switch school
      </Link>
    </div>
  )
}
