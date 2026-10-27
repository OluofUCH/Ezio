'use client'

import type { PaperQuestion } from '@/lib/client/types'

/**
 * The question map — the specialised progress tracker the design system calls for.
 *
 * Four states, and the colour assignment is deliberate: "answered" is blue and "current"
 * is the lemon primary, so the one dot a student is looking for never blends into the
 * bulk of the grid. Flagged is red and overrides answered, because a student who marked a
 * question for review needs to find it again even though it has an answer.
 */
export function QuestionMap({
  questions,
  answers,
  review,
  currentIndex,
  onJump,
}: {
  questions: PaperQuestion[]
  answers: Map<string, string[]>
  review: Set<string>
  currentIndex: number
  onJump: (index: number) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-6 md:grid-cols-5">
      {questions.map((question, position) => {
        const answered = (answers.get(question.id) ?? []).length > 0
        const flagged = review.has(question.id)
        const current = position === currentIndex

        const state = current
          ? 'progress-dot-current'
          : flagged
            ? 'progress-dot-flagged'
            : answered
              ? 'progress-dot-answered'
              : 'progress-dot-unanswered'

        const description = current
          ? 'current question'
          : flagged
            ? answered
              ? 'flagged, answered'
              : 'flagged, not answered'
            : answered
              ? 'answered'
              : 'not answered'

        return (
          <button
            key={question.id}
            type="button"
            onClick={() => onJump(position)}
            aria-label={`Question ${position + 1}, ${description}`}
            aria-current={current ? 'true' : undefined}
            className={`flex aspect-square w-full items-center justify-center rounded-full font-label-md text-label-md font-bold transition-all hover:opacity-80 ${state} ${
              current ? 'scale-110 ring-4 ring-primary-container/20' : ''
            }`}
          >
            {position + 1}
          </button>
        )
      })}
    </div>
  )
}

export function QuestionMapLegend() {
  const items = [
    { className: 'progress-dot-answered', label: 'Answered' },
    { className: 'progress-dot-current', label: 'Current' },
    { className: 'progress-dot-flagged', label: 'Flagged' },
    { className: 'progress-dot-unanswered', label: 'Unanswered' },
  ]

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
          <span className={`h-3 w-3 rounded-full ${item.className}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
