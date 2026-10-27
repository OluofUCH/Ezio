/**
 * SERVER-AUTHORITATIVE EXAM TIMING
 * ================================
 *
 * PRD §4.2 asks for a "client countdown + server-side timestamp check to prevent
 * tampering". Everything here derives from `startedAt` (a database default, written
 * by Postgres) and the server clock. No value a browser sends participates in
 * deciding whether a session is still open, so freezing or patching the client
 * countdown changes nothing about what the server will accept.
 *
 * Pure functions only — no database access, so this is directly unit-testable.
 * The write side (auto-submitting an expired session) lives in `lib/grading.ts`.
 */

/**
 * Slack granted past the hard deadline before a write is refused.
 *
 * Exists for one specific case: a student clicks the last option at T-1s and the
 * request lands at T+2s over a slow school link. Without grace that answer is
 * silently dropped. 15 seconds is far too short to be worth exploiting — you cannot
 * read and answer a question in it — and it is applied only to *accepting writes*,
 * never to extending the countdown the student sees.
 */
export const GRACE_SECONDS = 15

export type TimedSession = {
  startedAt: Date
  exam: { durationMins: number; endWindow: Date | null }
}

/**
 * The moment a session stops accepting answers.
 *
 * Whichever comes first: the student's own duration allowance, or the exam's
 * closing window. The window has to bound it too — otherwise a student starting
 * one minute before `endWindow` on a 60-minute exam would still be writing answers
 * an hour after the exam officially closed.
 */
export function sessionDeadline(session: TimedSession): Date {
  const durationDeadline = new Date(session.startedAt.getTime() + session.exam.durationMins * 60_000)

  if (session.exam.endWindow && session.exam.endWindow < durationDeadline) {
    return session.exam.endWindow
  }

  return durationDeadline
}

/** Seconds left, floored at 0. This is the value the client should trust over its own timer. */
export function secondsRemaining(session: TimedSession, now: Date = new Date()): number {
  const remaining = Math.floor((sessionDeadline(session).getTime() - now.getTime()) / 1000)
  return Math.max(0, remaining)
}

/** Whether the student's countdown has run out (no grace — this drives the UI). */
export function isPastDeadline(session: TimedSession, now: Date = new Date()): boolean {
  return now.getTime() > sessionDeadline(session).getTime()
}

/**
 * Whether a *write* should now be refused — the deadline plus grace.
 *
 * Kept distinct from `isPastDeadline` so the two concerns can't be conflated: the
 * student's timer hits zero at the deadline, while the server keeps accepting a
 * straggling save for a few more seconds.
 */
export function isWriteWindowClosed(session: TimedSession, now: Date = new Date()): boolean {
  return now.getTime() > sessionDeadline(session).getTime() + GRACE_SECONDS * 1000
}

/** Whether an exam is currently within its availability window. */
export function isWithinExamWindow(
  exam: { startWindow: Date | null; endWindow: Date | null },
  now: Date = new Date(),
): boolean {
  if (exam.startWindow && now < exam.startWindow) return false
  if (exam.endWindow && now > exam.endWindow) return false
  return true
}

/** Human-readable reason an exam is unavailable, for the student-facing list. */
export function examWindowState(
  exam: { startWindow: Date | null; endWindow: Date | null },
  now: Date = new Date(),
): 'NOT_YET_OPEN' | 'CLOSED' | 'OPEN' {
  if (exam.startWindow && now < exam.startWindow) return 'NOT_YET_OPEN'
  if (exam.endWindow && now > exam.endWindow) return 'CLOSED'
  return 'OPEN'
}
