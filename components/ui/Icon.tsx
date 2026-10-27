import type { CSSProperties } from 'react'

type IconProps = {
  /** A Material Symbols Outlined ligature name, e.g. `dashboard`, `timer`. */
  name: string
  /** Use the filled variant — the reference screens fill active/branded icons. */
  filled?: boolean
  /** Pixel size. Material Symbols is sized by font-size, not width/height. */
  size?: number
  className?: string
  title?: string
}

/**
 * A Material Symbols glyph.
 *
 * `aria-hidden` by default: these sit next to their own text label almost everywhere
 * in this UI, and announcing "dashboard dashboard" is worse than silence. Pass `title`
 * on the rare icon-only control and it becomes a labelled image instead.
 */
export function Icon({ name, filled = false, size, className = '', title }: IconProps) {
  const style: CSSProperties = {}
  if (size !== undefined) style.fontSize = `${size}px`
  if (filled) style.fontVariationSettings = "'FILL' 1"

  return (
    <span
      className={`material-symbols-outlined shrink-0 select-none leading-none ${className}`}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      translate="no"
    >
      {name}
    </span>
  )
}
