'use client'

import Link from 'next/link'
import { Alert } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { LoadingPanel } from '@/components/ui/Spinner'
import { StatCard } from '@/components/ui/Stats'
import { formatCount } from '@/lib/client/format'
import { useApi } from '@/lib/client/useApi'
import type { PlatformDashboard } from '../service'

export function PlatformDashboardScreen() {
  const { data, error, loading, refetch } = useApi<PlatformDashboard>('/api/platform/dashboard')
  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="font-label-md text-label-md text-primary">Platform administration</p>
        <h1 className="mt-1 font-headline-lg text-headline-lg-mobile md:text-headline-lg">Platform dashboard</h1>
        <p className="mt-2 max-w-3xl text-on-surface-variant">School onboarding, platform totals and school access status.</p>
      </div>
      <Link href="/staff/schools" className="btn-primary shrink-0"><Icon name="apartment" size={20} />Manage schools</Link>
    </header>
    {error ? <Alert tone="danger" title="Could not load platform totals">{error}<button type="button" className="mt-3 block underline" onClick={refetch}>Try again</button></Alert> : null}
    {loading ? <LoadingPanel message="Loading platform totals…" /> : data ? <>
      <section aria-label="Platform totals" className="grid gap-gutter sm:grid-cols-3">
        <StatCard label="Total schools" value={formatCount(data.totals.schools)} icon="apartment" />
        <StatCard label="Total students" value={formatCount(data.totals.students)} icon="group" />
        <StatCard label="Total teachers" value={formatCount(data.totals.teachers)} icon="badge" />
      </section>
      <section aria-labelledby="school-status-heading" className="space-y-4">
        <h2 id="school-status-heading" className="font-headline-md text-headline-md">School status</h2>
        <div className="grid gap-gutter sm:grid-cols-2">
          <StatCard label="Active schools" value={formatCount(data.schoolStatus.active)} icon="check_circle" />
          <StatCard label="Paused schools" value={formatCount(data.schoolStatus.paused)} icon="pause_circle" tone="neutral" />
        </div>
      </section>
      <p className="text-sm text-on-surface-variant">Totals include records in active and paused schools. Teacher totals include deactivated teacher accounts and exclude school administrators and parents.</p>
    </> : null}
  </div>
}
