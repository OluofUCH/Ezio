import type { ClassLevel, ExamMode, SessionStatus } from '@/lib/client/types'

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

/**
 * `JSS1` → `JSS 1`. The schema's enum is the storage form (PRD §4.2 fixes the set);
 * this is only ever for display, so nothing parses it back.
 */
export function classLevelLabel(level: ClassLevel): string {
  return level.replace(/^(JSS|SS)(\d)$/, '$1 $2')
}

const MODE_LABELS: Record<ExamMode, string> = {
  ONLINE: 'Online',
  OFFLINE_LAN: 'Offline (LAN)',
  HYBRID: 'Hybrid',
}

export function examModeLabel(mode: ExamMode): string {
  return MODE_LABELS[mode] ?? mode
}

const MODE_ICONS: Record<ExamMode, string> = {
  ONLINE: 'wifi',
  OFFLINE_LAN: 'lan',
  HYBRID: 'sync_alt',
}

export function examModeIcon(mode: ExamMode): string {
  return MODE_ICONS[mode] ?? 'quiz'
}

const STATUS_LABELS: Record<SessionStatus, string> = {
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  AUTO_SUBMITTED: 'Auto-submitted',
  FLAGGED: 'Flagged',
}

export function sessionStatusLabel(status: SessionStatus): string {
  return STATUS_LABELS[status] ?? status
}

/** A guessed subject icon. Cosmetic only — falls back to a generic glyph. */
export function subjectIcon(subject: string): string {
  const key = subject.toLowerCase()
  if (/math|algebra|geometr|arithmetic/.test(key)) return 'calculate'
  if (/physics/.test(key)) return 'bolt'
  if (/chem/.test(key)) return 'science'
  if (/bio|agric/.test(key)) return 'genetics'
  if (/english|literature|lang/.test(key)) return 'menu_book'
  if (/econom|account|commerce|business/.test(key)) return 'payments'
  if (/geograph/.test(key)) return 'public'
  if (/history|govern|civic/.test(key)) return 'gavel'
  if (/comput|ict|technolog/.test(key)) return 'computer'
  if (/health|physical/.test(key)) return 'fitness_center'
  return 'quiz'
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

/** `mm:ss`, or `h:mm:ss` past an hour. Used for the live exam countdown. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/** `90` → `1h 30m`. For exam duration, where seconds are noise. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/**
 * Dates are formatted with an explicit `en-NG` locale and Lagos time zone rather than
 * the browser default. An exam window is a fact about a Nigerian school day, and a
 * device with its clock set to another zone (or a machine imaged abroad, common in
 * school ICT labs) would otherwise render a misleading start time.
 */
const DATE_TIME = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Africa/Lagos',
})

const DATE_ONLY = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Lagos',
})

const TIME_ONLY = new Intl.DateTimeFormat('en-NG', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Africa/Lagos',
})

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : DATE_ONLY.format(date)
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : TIME_ONLY.format(date)
}

/** `2 mins ago`, `in 3 hours`. Used for sync recency and "last edited". */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'never'

  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000)
  const absolute = Math.abs(deltaSeconds)

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ]

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  let value = deltaSeconds
  for (const [unit, step] of units) {
    if (Math.abs(value) < step) return formatter.format(Math.round(value), unit)
    value /= step
  }
  return formatter.format(Math.round(value), 'year')
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(fractionDigits).replace(/\.0$/, '')}%`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-NG').format(value)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/**
 * Grade band for a percentage, using the WAEC-style boundaries Nigerian secondary
 * schools report against. Drives the colour of a score chip, so a teacher scanning a
 * results table sees the distribution without reading every number.
 */
export function scoreBand(percentage: number | null): 'excellent' | 'good' | 'pass' | 'fail' | 'none' {
  if (percentage === null) return 'none'
  if (percentage >= 75) return 'excellent'
  if (percentage >= 60) return 'good'
  if (percentage >= 40) return 'pass'
  return 'fail'
}
