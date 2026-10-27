import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'

/* ------------------------------------------------------------------ *
 * Badge
 * ------------------------------------------------------------------ */

export type BadgeTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-variant text-on-surface-variant',
  primary: 'bg-primary-container/25 text-on-primary-container',
  info: 'bg-secondary-fixed text-on-secondary-fixed',
  success: 'bg-primary-container/25 text-on-primary-container',
  warning: 'bg-[#fef3c7] text-[#92400e]',
  danger: 'bg-error-container text-on-error-container',
}

/** Pill-shaped, per the design system: status badges never look like buttons. */
export function Badge({
  children,
  tone = 'neutral',
  icon,
  className = '',
}: {
  children: ReactNode
  tone?: BadgeTone
  icon?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 font-label-sm text-label-sm ${BADGE_TONES[tone]} ${className}`}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Alert
 * ------------------------------------------------------------------ */

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const ALERT_TONES: Record<AlertTone, { wrap: string; icon: string }> = {
  info: { wrap: 'border-secondary-fixed-dim bg-secondary-fixed/40 text-on-secondary-fixed', icon: 'info' },
  success: {
    wrap: 'border-primary-container bg-primary-container/15 text-on-primary-container',
    icon: 'check_circle',
  },
  warning: { wrap: 'border-status-pending/40 bg-[#fffbeb] text-[#92400e]', icon: 'warning' },
  danger: { wrap: 'border-error/30 bg-error-container/60 text-on-error-container', icon: 'error' },
}

export function Alert({
  tone = 'info',
  title,
  children,
  onDismiss,
  className = '',
}: {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  const style = ALERT_TONES[tone]

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 ${style.wrap} ${className}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon name={style.icon} size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-label-md text-label-md font-bold">{title}</p> : null}
        {children ? (
          <div className={`font-body-md text-body-md ${title ? 'mt-1' : ''}`}>{children}</div>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 transition-opacity hover:opacity-70"
          aria-label="Dismiss"
        >
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Empty state
 * ------------------------------------------------------------------ */

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="font-headline-md text-headline-md text-on-surface">{title}</h3>
      {description ? (
        <p className="max-w-md font-body-md text-body-md text-on-surface-variant">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
