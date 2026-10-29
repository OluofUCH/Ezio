export type CalendarTerm = { id: string; name: string; orderIndex: number; startDate: string; endDate: string }
export type CalendarSession = {
  id: string; name: string; startDate: string; endDate: string; isCurrent: boolean; terms: CalendarTerm[]
}
export type CalendarResponse = { schoolId: string; sessions: CalendarSession[] }

export type ClassArmSummary = {
  id: string; level: import('@/lib/core/domain').ClassLevel; name: string; isDefault: boolean
  _count: { enrollments: number }
}
export type SubjectSummary = { id: string; name: string; _count: { exams: number } }
export type ClassArmsResponse = { schoolId: string; arms: ClassArmSummary[] }
export type SubjectsResponse = { schoolId: string; subjects: SubjectSummary[] }

export function calendarDateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}
