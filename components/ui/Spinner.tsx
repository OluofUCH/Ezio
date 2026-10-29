type SpinnerProps = { size?: number; className?: string; label?: string; decorative?: boolean }

export function Spinner({ size = 20, className = '', label, decorative = false }: SpinnerProps) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-current border-t-transparent align-[-2px] motion-safe:animate-spin ${className}`}
      style={{ width: size, height: size }}
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : (label ?? 'Loading')}
    />
  )
}

/** Full-panel loading state, for a page or card that has nothing to show yet. */
export function LoadingPanel({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-on-surface-variant">
      <Spinner size={28} className="text-primary-container" />
      <p className="font-body-md text-body-md">{message}</p>
    </div>
  )
}
