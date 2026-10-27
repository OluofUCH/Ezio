import type { SyncPullPayload } from '@/lib/sync/payload'
import { cloudConfig } from '@local/config'
import { db } from '@local/db'

/**
 * PULL — stage an exam onto this machine (PRD §3.4 step 1)
 * ========================================================
 *
 * Run while the school still has internet, before exam day. Afterwards this machine holds
 * everything needed to run and grade the paper with no connectivity at all.
 *
 * The payload type is imported from the cloud's `lib/sync/payload.ts` rather than redeclared,
 * so a field added on one side and forgotten on the other is a compile error here instead of
 * a surprise in a hall with no internet.
 *
 * Safe to re-run. Content is upserted by cloud id and the cached roster is reconciled to
 * match, so pulling again picks up a corrected paper. What it will NOT do is discard local
 * sittings — see the guard below.
 */
export async function pullExam(examId: string): Promise<{
  exam: { id: string; title: string; classLevel: string }
  questionCount: number
  studentCount: number
  clockSkewSeconds: number
}> {
  const { baseUrl, deviceKey } = cloudConfig()

  /**
   * Refuse to re-stage while unpushed results are on the machine.
   *
   * A re-pull can change the question set. If a sitting recorded against the old paper
   * were then pushed, the cloud would reject it as stale (or worse, grade it against
   * questions the student never saw). Pushing first is always the right order, so this
   * says so rather than silently risking the results.
   */
  const unsynced = await db.examSession.count({ where: { syncedAt: null, status: { not: 'IN_PROGRESS' } } })
  if (unsynced > 0) {
    throw new Error(
      `${unsynced} completed sitting(s) on this machine have not been pushed to the cloud yet. Run \`npm run push\` first — re-staging now could invalidate them.`,
    )
  }

  const response = await fetch(`${baseUrl}/api/sync/pull?examId=${encodeURIComponent(examId)}`, {
    headers: { authorization: `Bearer ${deviceKey}` },
  }).catch((error: unknown) => {
    throw new Error(
      `Could not reach the cloud at ${baseUrl}. Check the network and CLOUD_BASE_URL. (${
        error instanceof Error ? error.message : String(error)
      })`,
    )
  })

  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: SyncPullPayload }
    | { ok: false; error: { code: string; message: string } }
    | null

  if (!response.ok || !body || body.ok !== true) {
    const message = body && body.ok === false ? `${body.error.code}: ${body.error.message}` : `HTTP ${response.status}`
    throw new Error(`Pull refused by the cloud — ${message}`)
  }

  const payload = body.data

  /**
   * Clock skew matters more here than anywhere else in the system. Once offline, every
   * deadline this machine enforces comes from its own clock (../lib/timing.ts); a CMOS
   * battery that has given up could hand students an extra hour or cut them off early,
   * and nobody would notice until results looked wrong. Reported so the operator can fix
   * the clock before exam day.
   */
  const cloudTime = new Date(payload.meta.generatedAt)
  const clockSkewSeconds = Math.round((Date.now() - cloudTime.getTime()) / 1000)

  await db.$transaction(
    async (tx) => {
      await tx.syncState.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        localServerId: payload.localServer.id,
        localServerName: payload.localServer.name,
        schoolId: payload.school.id,
        schoolName: payload.school.name,
        schoolSlug: payload.school.slug,
        lastPulledAt: new Date(),
        cloudTimeAtPull: cloudTime,
      },
      update: {
        localServerId: payload.localServer.id,
        localServerName: payload.localServer.name,
        schoolId: payload.school.id,
        schoolName: payload.school.name,
        schoolSlug: payload.school.slug,
        lastPulledAt: new Date(),
        cloudTimeAtPull: cloudTime,
      },
    })

    const examRow = {
      title: payload.exam.title,
      subject: payload.exam.subject,
      classLevel: payload.exam.classLevel,
      durationMins: payload.exam.durationMins,
      mode: payload.exam.mode,
      shuffleQuestions: payload.exam.shuffleQuestions,
      shuffleOptions: payload.exam.shuffleOptions,
      maxAttempts: payload.exam.maxAttempts,
      startWindow: payload.exam.startWindow ? new Date(payload.exam.startWindow) : null,
      endWindow: payload.exam.endWindow ? new Date(payload.exam.endWindow) : null,
      pulledAt: new Date(),
    }

    await tx.exam.upsert({
      where: { id: payload.exam.id },
      create: { id: payload.exam.id, ...examRow },
      update: examRow,
    })

    /**
     * Questions are replaced, not merged. A re-pull exists to pick up an edited paper, and
     * merging would leave a deleted question sitting in the cache forever. The cascade
     * removes its options with it; the guard at the top of this function is what makes
     * deleting safe (no local sitting can depend on them).
     */
    await tx.question.deleteMany({ where: { examId: payload.exam.id } })

    for (const question of payload.questions) {
      await tx.question.create({
        data: {
          id: question.id,
          examId: payload.exam.id,
          text: question.text,
          type: question.type,
          points: question.points,
          orderIndex: question.orderIndex,
          options: {
            create: question.options.map((option) => ({
              id: option.id,
              text: option.text,
              isCorrect: option.isCorrect,
              orderIndex: option.orderIndex,
            })),
          },
        },
      })
    }

    /**
     * Roster upserted rather than replaced: a student row may already be referenced by a
     * DeviceSession or an ExamSession from a previous exam staged on this same machine.
     * Deleting would cascade those away.
     */
    for (const student of payload.students) {
      const row = {
        regNumber: student.regNumber,
        pin: student.pin,
        fullName: student.fullName,
        classLevel: student.classLevel,
      }
      await tx.student.upsert({
        where: { id: student.id },
        create: { id: student.id, ...row },
        update: row,
      })
    }
    },
    /**
     * Prisma's interactive transactions default to a 5-second timeout, and this one writes a
     * row per question and per student in sequence. A 100-question paper with a 200-strong
     * class comfortably exceeds that on the kind of low-end machine a school actually has —
     * and a staging step that fails halfway is exactly what must not happen the day before
     * an exam. Raised well past any realistic paper.
     */
    { timeout: 120_000, maxWait: 10_000 },
  )

  return {
    exam: { id: payload.exam.id, title: payload.exam.title, classLevel: payload.exam.classLevel },
    questionCount: payload.meta.questionCount,
    studentCount: payload.meta.studentCount,
    clockSkewSeconds,
  }
}
