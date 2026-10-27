import { ok, readJson, route } from '@/lib/api'
import { requireStudent } from '@/lib/auth/session'
import { requireOpenSession } from '@/lib/grading'
import { assertAffected, resolveSession } from '@/lib/tenant'
import { parseParam } from '@/lib/validation/common'
import {
  MAX_SECURITY_FLAGS,
  appendFlagsSchema,
  type StoredSecurityFlag,
} from '@/lib/validation/session'

export const runtime = 'nodejs'

type Params = { sessionId: string }

/**
 * POST /api/student/sessions/[sessionId]/flags — record malpractice signals.
 *
 * PRD §4.4: "tab-switch/window-blur detection, logged as `securityFlags` on the session
 * (visible to teacher, not auto-penalized in v1)".
 *
 * Both halves of that sentence are load-bearing. The session's `status` is left
 * untouched — it stays IN_PROGRESS. Promoting it to `FLAGGED` would take it out of every
 * `status: 'IN_PROGRESS'` guard in the codebase and end the student's exam on the
 * strength of a browser event, which is exactly the auto-penalty v1 rules out. A blur
 * event can just as easily be an on-screen keyboard opening, a low-battery notification,
 * or a school machine stealing focus for an antivirus popup.
 *
 * So this endpoint only ever appends to a log a teacher reads afterwards. The
 * deterrence is that the student is told it is being recorded.
 */
export const POST = route<Params>(async (req, ctx) => {
  const { session: auth, db } = await requireStudent(req)
  const sessionId = parseParam((await ctx.params).sessionId, 'sessionId')

  const session = await resolveSession(db, sessionId, auth.studentId)

  // Refuses (and auto-submits) once time is up, so the log cannot be padded after the
  // exam has ended.
  await requireOpenSession(db, session)

  const input = await readJson(req, appendFlagsSchema)

  const existing: StoredSecurityFlag[] = Array.isArray(session.securityFlags)
    ? (session.securityFlags as unknown[]).filter(
        (entry): entry is StoredSecurityFlag =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as StoredSecurityFlag).type === 'string' &&
          typeof (entry as StoredSecurityFlag).at === 'string',
      )
    : []

  // The server stamps the time. `securityFlagSchema` has no timestamp field at all, so
  // the log cannot be back- or forward-dated by a client clock.
  const at = new Date().toISOString()
  const incoming: StoredSecurityFlag[] = input.events.map((event) => ({ type: event.type, at }))

  /**
   * Keep the newest. A flaky touchscreen or a misbehaving blur handler can fire
   * hundreds of times, and this is one JSON column read on every session query — an
   * unbounded array would slow down every exam in the school. The count below is
   * reported unclamped so a teacher still sees that 800 events happened even when only
   * the last 200 were kept.
   */
  const merged = [...existing, ...incoming].slice(-MAX_SECURITY_FLAGS)

  /**
   * `updateMany` + `assertAffected`, not `update`: `ExamSession` reaches its school
   * through a relation, so the tenant extension blocks unique writes on it (lib/tenant.ts).
   * The `status` guard makes this a compare-and-set — a session that closed between
   * `requireOpenSession` and here affects zero rows rather than mutating a graded record.
   *
   * Read-modify-write on the JSON column means two flag posts landing at the same
   * instant can lose one event. Accepted deliberately: these are advisory signals whose
   * value is the pattern, not the exact tally, and the alternative (a row per event, or
   * locking the session) costs far more than a dropped duplicate blur is worth.
   */
  const updated = await db.examSession.updateMany({
    where: { id: sessionId, status: 'IN_PROGRESS' },
    data: { securityFlags: merged },
  })
  assertAffected(updated, 'Exam session is no longer open.')

  return ok({
    recorded: incoming.length,
    totalFlags: merged.length,
    // Signals to the client that older entries were dropped, not that events were lost.
    truncated: existing.length + incoming.length > MAX_SECURITY_FLAGS,
  })
})
