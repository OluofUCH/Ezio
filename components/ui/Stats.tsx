import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

/** A single headline number with an icon and optional trailing detail. */
export function StatCard({
  label,
  value,
  icon,
  detail,
  tone = 'primary',
  children,
}: {
  label: string
  value: ReactNode
  icon: string
  detail?: ReactNode
  tone?: 'primary' | 'info' | 'danger' | 'neutral'
  children?: ReactNode
}) {
  const tones = {
    primary: 'bg-primary-container/20 text-on-primary-container',
    info: 'bg-secondary-fixed text-on-secondary-fixed',
    danger: 'bg-error-container text-on-error-container',
    neutral: 'bg-surface-container text-on-surface-variant',
  } as const

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon name={icon} size={20} />
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-headline-lg text-headline-lg text-on-surface">{value}</span>
        {detail ? (
          <span className="font-label-sm text-label-sm text-on-surface-variant">{detail}</span>
        ) : null}
      </div>

      {children}
    </div>
  )
}

/** Horizontal progress bar. `value`/`max` rather than a percentage — the caller has counts. */
export function ProgressBar({
  value,
  max,
  tone = 'primary',
  className = '',
}: {
  value: number
  max: number
  tone?: 'primary' | 'info' | 'danger'
  className?: string
}) {
  // Guard the divide: an exam with no questions yet would otherwise render NaN%.
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const tones = {
    primary: 'bg-primary-container',
    info: 'bg-secondary-container',
    danger: 'bg-error',
  } as const

  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-surface-container ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full transition-all ${tones[tone]}`} style={{ width: `${percent}%` }} />
    </div>
  )
}

/**
 * Donut built from a `conic-gradient`, as in the reference screens — no charting
 * dependency for a single ring, and it scales crisply at any size.
 */
export function Donut({
  percent,
  label,
  caption,
  size = 128,
}: {
  percent: number
  label: string
  caption?: string
  size?: number
}) {
  const safe = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(#a8d93e 0% ${safe}%, #e5e7eb ${safe}% 100%)`,
        }}
        role="img"
        aria-label={`${label}: ${Math.round(safe)}%`}
      >
        <div
          className="flex flex-col items-center justify-center rounded-full bg-surface"
          style={{ width: size * 0.75, height: size * 0.75 }}
        >
          <span className="font-headline-md text-headline-md font-bold text-on-surface">{label}</span>
          {caption ? (
            <span className="font-label-sm text-label-sm text-on-surface-variant">{caption}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
