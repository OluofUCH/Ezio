'use client'

import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import type { PaperQuestion } from '@/lib/client/types'

const LETTERS = ['A', 'B', 'C', 'D'] as const

export function QuestionCard({
  question,
  number,
  total,
  selected,
  flagged,
  saving,
  onSelect,
  onToggleFlag,
}: {
  question: PaperQuestion
  number: number
  total: number
  selected: string[]
  flagged: boolean
  saving: boolean
  onSelect: (optionId: string) => void
  onToggleFlag: () => void
}) {
  const multiple = question.type === 'MULTIPLE_CHOICE'

  return (
    <div className="relative rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm md:p-8">
      {/* Question number medallion, as in the reference screen */}
      <div className="absolute -left-3 -top-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg md:-left-4 md:-top-4 md:h-12 md:w-12">
        <span className="font-headline-md text-headline-md font-bold">{number}</span>
      </div>

      <div className="mb-6 ml-6 flex items-start justify-between gap-4 md:ml-4">
        <div className="min-w-0 flex-1">
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Question {number} of {total} · {question.points}{' '}
            {question.points === 1 ? 'mark' : 'marks'}
          </p>
          <h2 className="mt-2 whitespace-pre-wrap font-headline-md text-headline-md font-semibold leading-snug text-on-surface md:text-headline-lg">
            {question.text}
          </h2>
        </div>

        <button
          type="button"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className={
            flagged
              ? 'flex shrink-0 items-center gap-2 rounded-lg border border-error bg-error-container/40 px-3 py-1.5 font-label-md text-label-md text-error transition-colors'
              : 'flex shrink-0 items-center gap-2 rounded-lg border border-outline-variant px-3 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error'
          }
        >
          <Icon name="flag" size={20} filled={flagged} />
          <span className="hidden sm:inline">{flagged ? 'Flagged' : 'Flag for review'}</span>
        </button>
      </div>

      <p className="mb-6 font-body-md text-body-md italic text-on-surface-variant">
        {multiple
          ? 'Select every option that applies.'
          : question.type === 'TRUE_FALSE'
            ? 'Choose true or false.'
            : 'Select the one correct answer.'}
        {saving ? (
          <span className="ml-3 inline-flex items-center gap-1.5 not-italic text-on-surface-variant">
            <Spinner size={12} />
            Saving…
          </span>
        ) : null}
      </p>

      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        role={multiple ? 'group' : 'radiogroup'}
        aria-label={`Options for question ${number}`}
      >
        {question.options.map((option, position) => {
          const isSelected = selected.includes(option.id)
          const letter = LETTERS[position] ?? String(position + 1)

          return (
            <label
              key={option.id}
              className={`option-card flex cursor-pointer items-start gap-4 rounded-xl border-2 p-5 ${
                isSelected
                  ? 'option-selected'
                  : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={`question-${question.id}`}
                value={option.id}
                checked={isSelected}
                onChange={() => onSelect(option.id)}
                className="mt-1 h-5 w-5 shrink-0 accent-[#4a6700]"
              />
              <div className="min-w-0 flex-1">
                <span
                  className={`mb-1 block font-label-md text-label-md font-bold ${
                    isSelected ? 'text-on-primary-container' : 'text-on-surface-variant'
                  }`}
                >
                  Option {letter}
                </span>
                <span className="block whitespace-pre-wrap font-body-lg text-body-lg text-on-surface">
                  {option.text}
                </span>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
