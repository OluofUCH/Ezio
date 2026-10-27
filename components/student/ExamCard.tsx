import Link from 'next/link'
import { Badge, type BadgeTone } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import {
  classLevelLabel,
  examModeIcon,
  examModeLabel,
  formatCountdown,
  formatDateTime,
  formatDuration,
  subjectIcon,
} from '@/lib/client/format'
import type { StudentExamListItem, WindowState } from '@/lib/client/types'

const WINDOW_BADGE: Record<WindowState, { tone: BadgeTone; label: string; icon: string }> = {
  OPEN: { tone: 'success', label: 'Open now', icon: 'play_circle' },
  NOT_YET_OPEN: { tone: 'info', label: 'Scheduled', icon: 'schedule' },
  CLOSED: { tone: 'neutral', label: 'Closed', icon: 'lock' },
}

/**
 * One available exam.
 *
 * `canStart` / `canResume` are read straight from the server rather than re-derived from
 * the window and attempt counts. The endpoint already resolves the rule
 * (`app/api/student/exams/route.ts`), and a card that enabled its own button on different
 * reasoning would show a Start that 409s — worse than showing no button at all.
 */
export function ExamCard({ exam }: { exam: StudentExamListItem }) {
  const window = WINDOW_BADGE[exam.windowState]
  const outOfAttempts = exam.attemptsRemaining === 0
  const noQuestions = exam.questionCount === 0

  return (
    <div className="card flex flex-col gap-5 p-6 transition-shadow hover:shadow-level-2">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
          <Icon name={subjectIcon(exam.subject)} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-headline-md text-headline-md leading-tight text-on-surface">{exam.title}</h3>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {exam.subject} · {classLevelLabel(exam.classLevel)}
          </p>
        </div>

        <Badge tone={window.tone} icon={window.icon}>
          {window.label}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact icon="timer" label="Duration" value={formatDuration(exam.durationMins)} />
        <Fact icon="help" label="Questions" value={String(exam.questionCount)} />
        <Fact icon={examModeIcon(exam.mode)} label="Mode" value={examModeLabel(exam.mode)} />
        <Fact
          icon="replay"
          label="Attempts"
          value={`${exam.attemptsRemaining} of ${exam.attemptsUsed + exam.attemptsRemaining} left`}
        />
      </dl>

      {exam.startWindow || exam.endWindow ? (
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          {exam.windowState === 'NOT_YET_OPEN' && exam.startWindow
            ? `Opens ${formatDateTime(exam.startWindow)}`
            : exam.endWindow
              ? `Closes ${formatDateTime(exam.endWindow)}`
              : null}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-4 border-t border-border-subtle pt-4">
        {exam.canResume && exam.activeSession ? (
          <p className="flex items-center gap-1.5 font-label-md text-label-md text-error">
            <Icon name="timer" size={18} filled />
            <span className="tabular">{formatCountdown(exam.activeSession.secondsRemaining)}</span> left
          </p>
        ) : (
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {/* The reason a disabled action is disabled, in the order the server checks. */}
            {noQuestions
              ? 'No questions added yet — tell your teacher.'
              : outOfAttempts
                ? 'You have used all your attempts.'
                : exam.windowState === 'NOT_YET_OPEN'
                  ? 'Not open yet.'
                  : exam.windowState === 'CLOSED'
                    ? 'This exam has closed.'
                    : 'Ready when you are.'}
          </p>
        )}

        {exam.canResume ? (
          <Link href={`/exam/${exam.id}`} className="btn-primary">
            <Icon name="play_arrow" size={20} />
            Resume
          </Link>
        ) : exam.canStart ? (
          <Link href={`/exam/${exam.id}`} className="btn-primary">
            Start exam
            <Icon name="arrow_forward" size={20} />
          </Link>
        ) : (
          <button type="button" disabled className="btn-primary">
            Start exam
          </button>
        )}
      </div>
    </div>
  )
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
        <Icon name={icon} size={14} />
        {label}
      </dt>
      <dd className="mt-0.5 font-label-md text-label-md text-on-surface">{value}</dd>
    </div>
  )
}
