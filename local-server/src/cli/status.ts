import { db, disconnect } from '@local/db'
import { applyMigrations } from '@local/db/migrate'

/**
 * `npm run status`
 *
 * What is on this machine, and what is still owed to the cloud. The question an invigilator
 * actually needs answered before wiping a hall PC or handing it back.
 */

async function main(): Promise<void> {
  await applyMigrations()
  const state = await db.syncState.findUnique({ where: { id: 'singleton' } })

  if (!state) {
    console.log('\n  Nothing staged. Run `npm run pull -- --exam=<examId>` while online.\n')
    return
  }

  const [exams, students, byStatus, pending] = await Promise.all([
    db.exam.findMany({
      select: { id: true, title: true, classLevel: true, pulledAt: true, _count: { select: { questions: true } } },
      orderBy: { pulledAt: 'desc' },
    }),
    db.student.count(),
    db.examSession.groupBy({ by: ['status'], _count: { _all: true } }),
    db.examSession.count({ where: { syncedAt: null, status: { not: 'IN_PROGRESS' } } }),
  ])

  console.log(`\n  School:  ${state.schoolName} (${state.schoolSlug})`)
  console.log(`  Device:  ${state.localServerName}`)
  console.log(`  Pulled:  ${state.lastPulledAt?.toISOString() ?? 'never'}`)
  console.log(`  Pushed:  ${state.lastPushedAt?.toISOString() ?? 'never'}`)

  console.log(`\n  Staged exams (${exams.length}), roster: ${students} student(s)`)
  for (const exam of exams) {
    console.log(`    ${exam.classLevel}  ${exam.title}  — ${exam._count.questions} question(s)`)
  }

  console.log('\n  Sittings on this machine:')
  if (byStatus.length === 0) {
    console.log('    none yet')
  } else {
    for (const group of byStatus) {
      console.log(`    ${group.status}: ${group._count._all}`)
    }
  }

  if (pending > 0) {
    console.log(`\n  ${pending} completed sitting(s) NOT yet uploaded.`)
    console.log('  Run `npm run push` before clearing or re-imaging this machine — this is the')
    console.log('  only copy of those results.\n')
    return
  }

  const openNow = byStatus.find((group) => group.status === 'IN_PROGRESS')?._count._all ?? 0
  if (openNow > 0) {
    console.log(`\n  ${openNow} session(s) still in progress. Run \`npm run push\` after the exam —`)
    console.log('  it closes any abandoned sittings first, then uploads them.\n')
    return
  }

  console.log('\n  Everything is synced to the cloud.\n')
}

main()
  .catch((error: unknown) => {
    console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(disconnect)
