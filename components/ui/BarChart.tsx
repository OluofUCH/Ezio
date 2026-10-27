'use client'

import { useState } from 'react'

export type Bar = { label: string; value: number; hint?: string }

/**
 * Vertical bar chart for a distribution.
 *
 * ONE SERIES, ONE COLOUR — deliberately. The bands are ordered and their position on the
 * x-axis already encodes that order, so painting each bar a different hue would encode
 * nothing the axis does not already say. Colouring by height instead (tallest bar
 * highlighted) would be worse still: it makes the colour follow the *rank* rather than the
 * entity, so re-running the same exam repaints the chart even when the shape is identical.
 *
 * Because there is a single series there is no legend — the heading names it. Every bar is
 * directly labelled with its value, which is also what discharges the contrast obligation
 * on the fill (see the `chart-bar` note in tailwind.config.ts).
 */
export function BarChart({
  bars,
  height = 240,
  valueSuffix = '',
  emptyMessage = 'No data yet.',
}: {
  bars: Bar[]
  height?: number
  valueSuffix?: string
  emptyMessage?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  const total = bars.reduce((sum, bar) => sum + bar.value, 0)
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-surface-container-low"
        style={{ height }}
      >
        <p className="font-body-md text-body-md text-on-surface-variant">{emptyMessage}</p>
      </div>
    )
  }

  const peak = Math.max(...bars.map((bar) => bar.value))
  // A "nice" ceiling so gridlines land on round numbers rather than on the peak itself.
  const ceiling = niceCeiling(peak)
  const ticks = 4

  return (
    <div>
      <div className="flex gap-3" style={{ height }}>
        {/* Y axis */}
        <div className="flex w-8 shrink-0 flex-col justify-between pb-7 text-right">
          {Array.from({ length: ticks + 1 }, (_, step) => (
            <span key={step} className="font-label-sm text-label-sm text-outline">
              {Math.round((ceiling * (ticks - step)) / ticks)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative flex-1">
          {/* Recessive gridlines, behind the marks. */}
          <div className="absolute inset-x-0 bottom-7 top-0 flex flex-col justify-between" aria-hidden>
            {Array.from({ length: ticks + 1 }, (_, step) => (
              <div key={step} className="h-0 w-full border-b border-outline-variant/25" />
            ))}
          </div>

          <div className="relative flex h-full items-end justify-around gap-2 pb-7">
            {bars.map((bar, position) => {
              const proportion = ceiling > 0 ? bar.value / ceiling : 0
              const share = total > 0 ? (bar.value / total) * 100 : 0
              const active = hovered === position

              return (
                <div
                  key={bar.label}
                  className="relative flex h-full flex-1 items-end justify-center"
                  onMouseEnter={() => setHovered(position)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(position)}
                  onBlur={() => setHovered(null)}
                >
                  {/* Tooltip */}
                  {active ? (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-lg border border-border-subtle bg-surface px-3 py-2 shadow-xl">
                      <p className="font-label-md text-label-md font-bold text-on-surface">
                        {bar.label}
                        {valueSuffix}
                      </p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">
                        {bar.value} {bar.value === 1 ? 'student' : 'students'} ·{' '}
                        {share.toFixed(share < 10 ? 1 : 0)}%
                      </p>
                      {bar.hint ? (
                        <p className="font-label-sm text-label-sm text-outline">{bar.hint}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    // 4px rounded data-end, anchored to the baseline. `max-w` keeps a
                    // two-bar chart from rendering as two slabs.
                    className={`w-full max-w-[64px] rounded-t-[4px] transition-colors ${
                      active ? 'bg-chart-bar-hover' : 'bg-chart-bar'
                    }`}
                    // A zero-count band still gets a hairline so the gap is visibly a
                    // measured zero rather than a missing bar.
                    style={{ height: `${Math.max(proportion * 100, bar.value === 0 ? 0.5 : 2)}%` }}
                    aria-label={`${bar.label}${valueSuffix}: ${bar.value} students`}
                  >
                    <span className="sr-only">
                      {bar.label}: {bar.value}
                    </span>
                  </button>

                  {/* Direct value label — every bar, since there are only a handful. */}
                  <span className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 -translate-y-1 font-label-sm text-label-sm font-bold text-on-surface">
                    {bar.value > 0 ? bar.value : ''}
                  </span>

                  <span className="absolute bottom-0 left-1/2 w-full -translate-x-1/2 text-center font-label-sm text-label-sm text-on-surface-variant">
                    {bar.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Round a peak up to 1/2/5 × 10ⁿ so the axis ticks are readable integers. */
function niceCeiling(peak: number): number {
  if (peak <= 4) return Math.max(peak, 4)
  const magnitude = 10 ** Math.floor(Math.log10(peak))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= peak) return candidate
  }
  return 10 * magnitude
}
