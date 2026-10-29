import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { ScopedStaffContext } from '../../lib/auth/session'

test('SMS foundations against an explicitly selected, migrated test database', async (t) => {
  const url = process.env.SMS_TEST_DATABASE_URL
  assert(url, 'Set SMS_TEST_DATABASE_URL to an isolated database after reviewing/applying the migration. This test does not apply migrations.')
  process.env.DATABASE_URL = url
  process.env.DIRECT_URL = url
  const { unscopedDb: root } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const { inspectBackfill, applyBackfill } = await import('../../src/modules/school-setup/backfill')
  const { createRosterStudents, updateRosterStudent } = await import('../../src/modules/students/service')
  const { updateLegacyExam } = await import('../../src/modules/school-setup/legacy-exams')
  const token = randomUUID()
  const ownedSchools: string[] = []

  try {
    // Fail before creating fixtures if the approved foundation schema is absent.
    const schemaProbe = tenantClient('__sms_test_schema_probe__')
    await schemaProbe.enrollment.findFirst({ select: { id: true, sequence: true, isCurrent: true } })
    await schemaProbe.exam.findFirst({ select: { subjectId: true, termId: true, componentId: true } })
    const a = await root.school.create({ data: { name: 'SMS fixture A', slug: `sms-a-${token}` } })
    ownedSchools.push(a.id)
    const b = await root.school.create({ data: { name: 'SMS fixture B', slug: `sms-b-${token}` } })
    ownedSchools.push(b.id)
    const admin = await root.user.create({ data: {
      schoolId: a.id, email: `sms-${token}@example.test`, passwordHash: 'test-fixture-not-a-login', fullName: 'Fixture Admin', role: 'SCHOOL_ADMIN',
    } })
    const db = tenantClient(a.id)
    const other = tenantClient(b.id)
    const context: ScopedStaffContext = { db, schoolId: a.id, session: { typ: 'staff', userId: admin.id, role: 'SCHOOL_ADMIN', schoolId: a.id } }
    const student = await root.student.create({ data: { schoolId: a.id, regNumber: 'OLD01', fullName: 'Legacy Student', classLevel: 'JSS2', pin: '001234' } })
    const exam = await root.exam.create({ data: {
      schoolId: a.id, createdById: admin.id, title: 'Legacy exam', subject: ' Mathematics ', classLevel: 'JSS2', durationMins: 30,
    } })
    const config = {
      schoolId: a.id, session: { name: 'Fixture session', startDate: '2026-09-01', endDate: '2027-07-31' },
      defaultArms: { JSS1: 'A', JSS2: 'A', JSS3: 'A', SS1: 'A', SS2: 'A', SS3: 'A' },
      arms: { JSS1: ['A', 'B', 'C'], JSS2: ['A', 'B', 'C'], JSS3: ['A', 'B', 'C'], SS1: ['A', 'B', 'C'], SS2: ['A', 'B', 'C'], SS3: ['A', 'B', 'C'] },
    }

    await t.test('multi-arm dry run writes nothing; apply preserves CBT identity/credentials and reruns are idempotent', async () => {
      const preview = await inspectBackfill(db, config)
      assert.equal(preview.armsToCreate, 18)
      assert.equal(preview.enrollmentsToCreate, 1)
      assert.equal(preview.examsToLink, 1)
      assert.equal(await db.academicSession.count(), 0)
      assert.equal(await db.enrollment.count(), 0)
      assert.equal(await db.subject.count(), 0)
      assert.equal(await db.classArm.count(), 0)
      const applied = await applyBackfill(db, config)
      assert.equal(applied.enrollmentsCreated, 1)
      const arms = await db.classArm.findMany({ orderBy: { id: 'asc' } })
      assert.equal(arms.length, 18)
      for (const level of ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3']) {
        assert.deepEqual(arms.filter(arm => arm.level === level).map(arm => arm.name).sort(), ['A', 'B', 'C'])
        assert.deepEqual(arms.filter(arm => arm.level === level && arm.isDefault).map(arm => arm.name), ['A'])
      }
      const placement = await db.enrollment.findFirstOrThrow({ where: { studentId: student.id, isCurrent: true }, include: { classArm: true } })
      assert.equal(placement.classArm.level, 'JSS2')
      assert.equal(placement.classArm.name, 'A')
      assert.equal(placement.classArm.isDefault, true)
      assert.deepEqual(await db.student.findFirst({ where: { id: student.id } }), student)
      const linked = await db.exam.findFirstOrThrow({ where: { id: exam.id } })
      assert.equal(linked.subject, exam.subject)
      assert.equal(linked.classLevel, exam.classLevel)
      assert.equal(linked.termId, null)
      assert.equal(linked.componentId, null)
      assert(linked.subjectId)
      const rerun = await applyBackfill(db, config)
      assert.equal(rerun.enrollmentsCreated, 0)
      assert.equal(rerun.examsLinked, 0)
      assert.equal(rerun.verification.armsToCreate, 0)
      assert.equal(rerun.verification.enrollmentsToCreate, 0)
      assert.equal(rerun.verification.examsToLink, 0)
      assert.deepEqual(rerun.verification.conflicts, [])
      assert.deepEqual(await db.classArm.findMany({ orderBy: { id: 'asc' } }), arms)
      assert.equal(await other.academicSession.count(), 0)
      assert.equal(await other.classArm.count(), 0)
      assert.equal(await other.enrollment.count(), 0)
    })

    await t.test('foreign IDs are filtered and composite FKs reject cross-tenant parents', async () => {
      const foreignStudent = await root.student.create({ data: { schoolId: b.id, regNumber: 'OLD01', fullName: 'Other Student', classLevel: 'JSS2', pin: '123456' } })
      assert.equal(await db.student.findFirst({ where: { id: foreignStudent.id } }), null)
      await assert.rejects(updateRosterStudent(context, foreignStudent.id, { fullName: 'Wrong school' }), { code: 'NOT_FOUND' })
      const session = await db.academicSession.findFirstOrThrow()
      const arm = await db.classArm.findFirstOrThrow({ where: { level: 'JSS2' } })
      await assert.rejects(db.enrollment.create({ data: {
        schoolId: a.id, studentId: foreignStudent.id, academicSessionId: session.id, classArmId: arm.id, sequence: 1, isCurrent: true,
      } }), { code: 'P2003' })
      const foreignSubject = await other.subject.create({ data: { schoolId: b.id, name: 'Foreign subject', normalizedName: 'foreign subject' } })
      await assert.rejects(db.exam.update({ where: { id: exam.id }, data: { subjectId: foreignSubject.id } }), { code: 'P2003' })
    })

    await t.test('transaction scope does not borrow another school’s current academic setup', async () => {
      const adminB = await root.user.create({ data: {
        schoolId: b.id, email: `sms-b-${token}@example.test`, passwordHash: 'test-fixture-not-a-login', fullName: 'Other Admin', role: 'SCHOOL_ADMIN',
      } })
      const otherContext: ScopedStaffContext = {
        db: other, schoolId: b.id,
        session: { typ: 'staff', userId: adminB.id, role: 'SCHOOL_ADMIN', schoolId: b.id },
      }
      await createRosterStudents(otherContext, [{ regNumber: 'NOSESSION', fullName: 'CBT Only Student', classLevel: 'SS1', pin: '123456' }])
      assert.equal(await other.academicSession.count(), 0)
      assert.equal(await other.enrollment.count(), 0)
    })

    await t.test('legacy class edits append history and keep the CBT class in sync', async () => {
      await updateRosterStudent(context, student.id, { classLevel: 'JSS3' })
      const history = await db.enrollment.findMany({ where: { studentId: student.id }, include: { classArm: true }, orderBy: { sequence: 'asc' } })
      assert.equal(history.length, 2)
      assert.equal(history[0]?.classArm.level, 'JSS2')
      assert.equal(history[0]?.isCurrent, false)
      assert(history[0]?.effectiveTo)
      assert.equal(history[1]?.classArm.level, 'JSS3')
      assert.equal(history[1]?.isCurrent, true)
      assert.equal((await db.student.findFirstOrThrow({ where: { id: student.id } })).classLevel, 'JSS3')
      await updateLegacyExam(context, exam.id, { classLevel: 'JSS3', subject: 'English Language' }, { id: true })
      const updated = await db.exam.findFirstOrThrow({ where: { id: exam.id }, include: { subjectRecord: true } })
      assert.equal(updated.subjectRecord?.normalizedName, 'english language')
      const sitting = await root.examSession.create({ data: { examId: exam.id, studentId: student.id } })
      await assert.rejects(updateRosterStudent(context, student.id, { classLevel: 'SS1' }), { code: 'CONFLICT' })
      assert.equal(await db.enrollment.count({ where: { studentId: student.id } }), 2)
      await root.examSession.delete({ where: { id: sitting.id } })
    })

    await t.test('bulk roster/enrollment creation commits together and duplicate batches roll back', async () => {
      const row = { regNumber: 'NEW01', fullName: 'New Student', classLevel: 'JSS1' as const, pin: '002345' }
      const before = await db.student.count()
      await assert.rejects(createRosterStudents(context, [row, row]), { code: 'P2002' })
      assert.equal(await db.student.count(), before)
      await createRosterStudents(context, [row, { ...row, regNumber: 'NEW02', classLevel: 'SS1' }])
      const added = await db.student.findMany({ where: { regNumber: { in: ['NEW01', 'NEW02'] } }, include: { enrollments: { include: { classArm: true } } } })
      assert.equal(added.length, 2)
      for (const item of added) {
        assert.equal(item.pin, '002345')
        assert.equal(item.enrollments.length, 1)
        assert.equal(item.enrollments[0]?.classArm.level, item.classLevel)
      }
      await assert.rejects(createRosterStudents({ ...context, session: { ...context.session, role: 'TEACHER' } }, [row]), { code: 'FORBIDDEN' })
    })

    await t.test('a failure after roster insertion rolls back the roster as well as enrollment work', async () => {
      const failingDb = db.$extends({ query: { enrollment: {
        async createMany() { throw new Error('Injected enrollment failure') },
      } } })
      const before = await db.enrollment.count()
      await assert.rejects(createRosterStudents({ ...context, db: failingDb }, [{
        regNumber: 'ROLLBACK', fullName: 'Rollback Fixture', classLevel: 'JSS1', pin: '123456',
      }]), /Injected enrollment failure/)
      assert.equal(await db.student.findFirst({ where: { regNumber: 'ROLLBACK' } }), null)
      assert.equal(await db.enrollment.count(), before)
    })
  } finally {
    // Only fixture IDs created by this invocation are removed; no schema resets.
    const where = { schoolId: { in: ownedSchools } }
    try {
      if (ownedSchools.length) {
        await root.exam.deleteMany({ where })
        await root.enrollment.deleteMany({ where })
        await root.term.deleteMany({ where })
        await root.classArm.deleteMany({ where })
        await root.subject.deleteMany({ where })
        await root.assessmentComponent.deleteMany({ where })
        await root.academicSession.deleteMany({ where })
        await root.student.deleteMany({ where })
        await root.user.deleteMany({ where })
        await root.school.deleteMany({ where: { id: { in: ownedSchools } } })
      }
    } finally {
      await root.$disconnect()
    }
  }
})
