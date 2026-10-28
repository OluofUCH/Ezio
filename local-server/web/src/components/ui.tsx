import type { ReactNode } from 'react'

export function Icon({ name, size, filled, className = '' }: { name: string; size?: number; filled?: boolean; className?: string }) {
  return (
    <span
      className={`material-symbols-outlined shrink-0 select-none leading-none ${filled ? 'filled' : ''} ${className}`}
      style={{ fontSize: size ? `${size}px` : undefined }}
      aria-hidden
    >
      {name}
    </span>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container text-on-surface shadow-sm">
        <Icon name="school" filled size={22} />
      </div>
      {compact ? null : (
        <div className="min-w-0">
          <p className="font-headline-md text-headline-md font-bold leading-tight text-on-surface">Ezio</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">Offline Hall Server</p>
        </div>
      )}
    </div>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  onDismiss,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  children: ReactNode
  onDismiss?: () => void
}) {
  const styles = {
    info: 'border-secondary/20 bg-secondary/5 text-on-surface',
    success: 'border-primary/30 bg-primary/5 text-on-surface',
    warning: 'border-status-pending/40 bg-status-pending/10 text-on-surface',
    danger: 'border-error/30 bg-error-container/60 text-on-error-container',
  }[tone]
  const icon = { info: 'info', success: 'check_circle', warning: 'warning', danger: 'error' }[tone]

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`} role="alert">
      <Icon name={icon} filled size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="rounded p-1 opacity-60 hover:opacity-100" aria-label="Dismiss">
          <Icon name="close" size={18} />
        </button>
      ) : null}
    </div>
  )
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  )
}

export function Loading({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-on-surface-variant">
      <Spinner size={28} />
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-on-surface">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function StepBadge({ number, active, done }: { number: number; active: boolean; done: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        done ? 'bg-primary-container text-on-surface' : active ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'
      }`}
    >
      {done ? <Icon name="check" size={18} /> : number}
    </span>
  )
}
