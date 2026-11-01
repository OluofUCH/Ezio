'use client'

import Link from 'next/link'
import { EmptyState } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { useScope } from '@/components/staff/ScopeProvider'

/** Client-side fallback; server page and API guards enforce school-role access. */
export function SchoolGate({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = useScope()

  if (!isSuperAdmin) return <>{children}</>

  return (
    <div className="card">
      <EmptyState
        icon="apartment"
        title="School staff access required"
        description="Manage onboarding and school access from the platform dashboard."
        action={
          <Link href="/staff/platform" className="btn-primary">
            <Icon name="list" size={20} />
            Platform dashboard
          </Link>
        }
      />
    </div>
  )
}

/** The school attached to the authenticated account. */
export function ActiveSchoolBanner() {
  const { isSuperAdmin, schoolId, activeSchoolName } = useScope()

  if (isSuperAdmin || !schoolId) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-secondary-fixed-dim bg-secondary-fixed/40 px-4 py-3">
      <p className="flex items-center gap-2 font-label-md text-label-md text-on-secondary-fixed">
        <Icon name="visibility" size={18} />
        <strong>{activeSchoolName ?? schoolId}</strong>
      </p>
    </div>
  )
}
