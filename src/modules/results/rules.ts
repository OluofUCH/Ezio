import Decimal from 'decimal.js'
import { z } from 'zod'

export const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
export const numericScore = z.coerce.number().finite().min(0).max(100)
export const componentSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), maxScore: numericScore.refine((v) => v > 0), orderIndex: z.number().int().min(0).default(0) })
export const bandSchema = z.object({ minScore: numericScore, maxScore: numericScore, grade: z.string().trim().min(1).max(12), remark: z.string().trim().min(1).max(120) })
export const assessmentSchema = z.object({ components: z.array(componentSchema).min(1).max(12), bands: z.array(bandSchema).min(1).max(30) }).strict().superRefine((value, ctx) => {
  if (!value.components.reduce((sum, c) => sum.plus(c.maxScore), new Decimal(0)).equals(100)) ctx.addIssue({ code: 'custom', path: ['components'], message: 'Component maximum scores must total exactly 100.' })
  if (new Set(value.components.map((c) => c.name.toLowerCase())).size !== value.components.length) ctx.addIssue({ code: 'custom', path: ['components'], message: 'Component names must be unique.' })
  const bands = [...value.bands].sort((a, b) => a.minScore - b.minScore)
  let next = new Decimal(0)
  for (const band of bands) {
    if (!money(band.minScore).equals(next) || band.maxScore < band.minScore) ctx.addIssue({ code: 'custom', path: ['bands'], message: 'Grade bands must cover 0–100 without gaps or overlaps at two-decimal precision.' })
    next = money(band.maxScore).plus('0.01')
  }
  if (!next.equals('100.01')) ctx.addIssue({ code: 'custom', path: ['bands'], message: 'Grade bands must cover scores through 100.' })
})
export type Component = { id: string; name: string; maxScore: number; orderIndex: number }
export type Grade = z.infer<typeof bandSchema>
export function gradeFor(score: Decimal.Value, bands: Grade[]) {
  const mark = money(score).toNumber()
  const band = bands.find((b) => mark >= b.minScore && mark <= b.maxScore)
  if (!band) throw new Error('The grading policy does not cover this score.')
  return { grade: band.grade, remark: band.remark }
}
export function rankedTotals<T extends { id: string; totals: Decimal.Value[] }>(students: T[]) {
  const rows = students.map((s) => ({ ...s, total: money(s.totals.reduce<Decimal>((sum, n) => sum.plus(n), new Decimal(0))), average: money(s.totals.reduce<Decimal>((sum, n) => sum.plus(n), new Decimal(0)).div(s.totals.length || 1)) }))
  rows.sort((a, b) => b.total.comparedTo(a.total) || a.id.localeCompare(b.id))
  let position = 1
  return rows.map((row, index) => { if (index && !row.total.equals(rows[index - 1]!.total)) position = index + 1; return { ...row, position } })
}
export function scaleCbt(score: Decimal.Value, total: Decimal.Value, max: Decimal.Value) {
  if (new Decimal(total).lte(0)) throw new Error('Exam total points must be positive.')
  return money(new Decimal(score).div(total).times(max))
}
