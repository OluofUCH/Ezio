import type { Grade } from './rules'

export const STANDARD_GRADE_BANDS: readonly Grade[] = [
  { minScore: 0, maxScore: 39.99, grade: 'F', remark: 'Fail' },
  { minScore: 40, maxScore: 44.99, grade: 'E', remark: 'Pass' },
  { minScore: 45, maxScore: 49.99, grade: 'D', remark: 'Fair' },
  { minScore: 50, maxScore: 59.99, grade: 'C', remark: 'Good' },
  { minScore: 60, maxScore: 69.99, grade: 'B', remark: 'Very good' },
  { minScore: 70, maxScore: 100, grade: 'A', remark: 'Excellent' },
]

export const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export const REMARK_OPTIONS = ['Excellent', 'Very good', 'Good', 'Fair', 'Pass', 'Fail'] as const
