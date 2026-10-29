import type { TenantDb } from '@/lib/tenant'
import { CLASS_LEVELS } from '@/lib/core/domain'
import { conflict, notFound } from '@/lib/errors'
import { schoolTransaction, type SchoolTransaction } from '@/src/modules/shared/transaction'
import { ensureCurrentEnrollment } from '@/src/modules/students/enrollments'
import { asDatabaseDate, backfillConfigSchema, type BackfillConfig } from './backfill-config'
import { assertCurrentPlacement, subjectIdentity } from './rules'
import { ensureSubject } from './subjects'

const BATCH_SIZE = 100
type ReadDb = Pick<SchoolTransaction, 'school' | 'academicSession' | 'classArm' | 'student' | 'exam' | 'subject'>

async function checkSettings(db: ReadDb, config: BackfillConfig) {
  const school = await db.school.findFirst({ where: { id: config.schoolId }, select: { id: true, name: true } })
  if (!school) throw notFound('The configured school does not exist in this scope.')
  const current = await db.academicSession.findFirst({ where: { isCurrent: true } })
  if (current && current.name !== config.session.name) {
    throw conflict('A different academic session is already current. Backfill does not perform session rollover.')
  }
  const session = await db.academicSession.findFirst({ where: { name: config.session.name } })
  if (session && (session.startDate.getTime() !== asDatabaseDate(config.session.startDate).getTime() ||
      session.endDate.getTime() !== asDatabaseDate(config.session.endDate).getTime())) {
    throw conflict('The existing session dates differ from this configuration. Backfill does not overwrite them.')
  }
  const defaults = await db.classArm.findMany({ where: { isDefault: true } })
  for (const arm of defaults) {
    if (arm.name !== config.defaultArms[arm.level]) {
      throw conflict(`The default ${arm.level} arm is already "${arm.name}". Review the mapping rather than replacing it.`)
    }
  }
  const allArms = await db.classArm.findMany()
  for (const level of CLASS_LEVELS) {
    const configured = config.arms?.[level] ?? [config.defaultArms[level]]
    for (const label of configured) {
      const matches = allArms.filter((arm) => arm.level === level && arm.name.trim().toLowerCase() === label.trim().toLowerCase())
      if (matches.length > 1 || (matches.length === 1 && matches[0]!.name !== label)) {
        throw conflict(`The existing ${level} arm label conflicts with configured arm "${label}". Review the spelling/case rather than creating a duplicate.`)
      }
    }
  }
  return { school, session, allArms }
}

/** Read-only inventory. Does not create config, subjects or enrollments. */
export async function inspectBackfill(db: TenantDb, rawConfig: BackfillConfig) {
  const config = backfillConfigSchema.parse(rawConfig)
  const settings = await checkSettings(db, config)
  const report = {
    schoolId: settings.school.id,
    schoolName: settings.school.name,
    students: 0,
    enrollmentsToCreate: 0,
    exams: 0,
    examsToLink: 0,
    subjectsToCreate: 0,
    armsToCreate: 0,
    subjectVariants: [] as { normalizedName: string; labels: string[] }[],
    conflicts: [] as { record: string; id: string; message: string }[],
  }
  for (const level of CLASS_LEVELS) {
    for (const label of config.arms?.[level] ?? [config.defaultArms[level]]) {
      if (!settings.allArms.some((arm) => arm.level === level && arm.name === label)) report.armsToCreate++
    }
  }
  let after = ''
  for (;;) {
    const students = await db.student.findMany({
      where: after ? { id: { gt: after } } : {}, orderBy: { id: 'asc' }, take: BATCH_SIZE,
      select: {
        id: true, schoolId: true, classLevel: true,
        enrollments: { where: { isCurrent: true }, include: { classArm: true } },
        _count: { select: { enrollments: true } },
      },
    })
    if (!students.length) break
    for (const student of students) {
      report.students++
      const current = student.enrollments[0]
      try {
        if (current) {
          if (!settings.session) throw conflict('Current enrollment belongs to another session.')
          assertCurrentPlacement(student, settings.session, current)
        } else if (student._count.enrollments) {
          throw conflict('Enrollment history exists without a current placement; manual review is required.')
        } else {
          report.enrollmentsToCreate++
        }
      } catch (error) {
        report.conflicts.push({ record: 'Student', id: student.id, message: (error as Error).message })
      }
    }
    after = students[students.length - 1]!.id
  }

  const labels = new Map<string, Set<string>>()
  after = ''
  for (;;) {
    const exams = await db.exam.findMany({
      where: after ? { id: { gt: after } } : {}, orderBy: { id: 'asc' }, take: BATCH_SIZE,
      select: { id: true, subject: true, subjectId: true, subjectRecord: { select: { normalizedName: true } } },
    })
    if (!exams.length) break
    for (const exam of exams) {
      report.exams++
      try {
        const identity = subjectIdentity(exam.subject)
        const variants = labels.get(identity.normalizedName) ?? new Set<string>()
        variants.add(exam.subject)
        labels.set(identity.normalizedName, variants)
        if (exam.subjectRecord && exam.subjectRecord.normalizedName !== identity.normalizedName) {
          throw conflict('The subject link disagrees with the CBT label. Review it before backfilling.')
        }
        if (!exam.subjectId) report.examsToLink++
      } catch (error) {
        report.conflicts.push({ record: 'Exam', id: exam.id, message: (error as Error).message })
      }
    }
    after = exams[exams.length - 1]!.id
  }
  const existing = await db.subject.findMany({
    where: { normalizedName: { in: [...labels.keys()] } }, select: { normalizedName: true },
  })
  const present = new Set(existing.map((subject) => subject.normalizedName))
  report.subjectsToCreate = [...labels.keys()].filter((name) => !present.has(name)).length
  report.subjectVariants = [...labels].filter(([, values]) => values.size > 1)
    .map(([normalizedName, values]) => ({ normalizedName, labels: [...values].sort() }))
  return report
}

async function initializeSchool(tx: SchoolTransaction, config: BackfillConfig) {
  const existing = await checkSettings(tx, config)
  let session = existing.session ?? await tx.academicSession.create({
    data: {
      schoolId: config.schoolId,
      name: config.session.name,
      startDate: asDatabaseDate(config.session.startDate),
      endDate: asDatabaseDate(config.session.endDate),
    },
  })
  const arms = []
  for (const level of CLASS_LEVELS) {
    const defaultName = config.defaultArms[level]
    for (const name of config.arms?.[level] ?? [defaultName]) {
      let arm = await tx.classArm.findFirst({ where: { level, name } })
      if (!arm) {
        arm = await tx.classArm.create({ data: { schoolId: config.schoolId, level, name, isDefault: name === defaultName } })
      } else if (name === defaultName && !arm.isDefault) {
        arm = await tx.classArm.update({ where: { id: arm.id }, data: { isDefault: true } })
      }
      arms.push(arm)
    }
  }
  // Expose compatibility only when all six default arms exist, in the same commit.
  if (!session.isCurrent) {
    session = await tx.academicSession.update({ where: { id: session.id }, data: { isCurrent: true } })
  }
  return { session, arms }
}

/** Resumable, additive batches. A changed/conflicting record stops instead of overwriting history. */
export async function applyBackfill(db: TenantDb, rawConfig: BackfillConfig) {
  const config = backfillConfigSchema.parse(rawConfig)
  const preview = await inspectBackfill(db, config)
  if (preview.conflicts.length) throw conflict('Resolve the dry-run conflicts before applying the backfill.', 'CONFLICT', preview)
  const setup = await schoolTransaction(db, (tx) => initializeSchool(tx, config))
  const progress = { studentsChecked: 0, enrollmentsCreated: 0, examsChecked: 0, examsLinked: 0 }
  let after = ''
  for (;;) {
    const students = await db.student.findMany({
      where: after ? { id: { gt: after } } : {}, orderBy: { id: 'asc' }, take: BATCH_SIZE, select: { id: true },
    })
    if (!students.length) break
    for (const candidate of students) {
      const created = await schoolTransaction(db, async (tx) => {
        const student = await tx.student.findFirst({
          where: { id: candidate.id }, select: { id: true, schoolId: true, classLevel: true },
        })
        if (!student) throw conflict('A student was removed during backfill. Review and rerun.')
        const current = await tx.academicSession.findFirst({ where: { isCurrent: true } })
        if (current?.id !== setup.session.id) throw conflict('The current session changed during backfill. Review and rerun.')
        return (await ensureCurrentEnrollment(tx, student, setup, 'LEGACY_BACKFILL')).created
      })
      progress.studentsChecked++
      if (created) progress.enrollmentsCreated++
    }
    after = students[students.length - 1]!.id
  }
  after = ''
  for (;;) {
    const exams = await db.exam.findMany({
      where: after ? { id: { gt: after } } : {}, orderBy: { id: 'asc' }, take: BATCH_SIZE, select: { id: true },
    })
    if (!exams.length) break
    for (const candidate of exams) {
      const linked = await schoolTransaction(db, async (tx) => {
        const exam = await tx.exam.findFirst({ where: { id: candidate.id }, include: { subjectRecord: true } })
        if (!exam) throw conflict('An exam was removed during backfill. Review and rerun.')
        const identity = subjectIdentity(exam.subject)
        if (exam.subjectRecord) {
          if (exam.subjectRecord.normalizedName !== identity.normalizedName) throw conflict('The subject label/link changed during backfill.')
          return false
        }
        const subject = await ensureSubject(tx, config.schoolId, exam.subject)
        await tx.exam.update({ where: { id: exam.id }, data: { subjectId: subject.id } })
        return true
      })
      progress.examsChecked++
      if (linked) progress.examsLinked++
    }
    after = exams[exams.length - 1]!.id
  }
  return { ...progress, verification: await inspectBackfill(db, config) }
}
