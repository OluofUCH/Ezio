import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { ClassArm, Enrollment, Student } from '@prisma/client'
import { CLASS_LEVELS } from '../../lib/core/domain'

test('fees are term-specific and editable only by form teachers or school administrators', async t => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated migrated database.')
  Object.assign(process.env, { DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL })
  const { unscopedDb: root } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const { feeRegister, setFeeStatus } = await import('../../src/modules/fees/service')
  const { staffDashboard } = await import('../../src/modules/dashboards/service')
  const suffix = randomUUID(), schoolIds: string[] = []
  const day = (offset: number) => { const value = new Date(); value.setUTCHours(0, 0, 0, 0); value.setUTCDate(value.getUTCDate() + offset); return value }
  try {
    const school = await root.school.create({ data: { name: 'Fee test A', slug: `fee-a-${suffix}` } }); schoolIds.push(school.id)
    const foreign = await root.school.create({ data: { name: 'Fee test B', slug: `fee-b-${suffix}` } }); schoolIds.push(foreign.id)
    const db = tenantClient(school.id)
    const staff = async (name: string, role: 'SCHOOL_ADMIN' | 'TEACHER') => root.user.create({ data: { schoolId: school.id, fullName: name, role, email: `${name}-${suffix}@test.local`, passwordHash: 'unused' } })
    const admin = await staff('Admin', 'SCHOOL_ADMIN'), teacher = await staff('Form', 'TEACHER'), otherTeacher = await staff('OtherForm', 'TEACHER'), subjectTeacher = await staff('SubjectOnly', 'TEACHER')
    const context = (user: typeof admin) => ({ schoolId: school.id, db, session: { typ: 'staff' as const, userId: user.id, role: user.role, schoolId: school.id } })
    const adminCtx = context(admin), teacherCtx = context(teacher), otherCtx = context(otherTeacher), subjectCtx = context(subjectTeacher)
    const session = await db.academicSession.create({ data: { schoolId: school.id, name: 'Fee year', startDate: day(-30), endDate: day(90), isCurrent: true } })
    const term = await db.term.create({ data: { schoolId: school.id, academicSessionId: session.id, name: 'First term', orderIndex: 1, startDate: day(-30), endDate: day(30) } })
    const nextTerm = await db.term.create({ data: { schoolId: school.id, academicSessionId: session.id, name: 'Second term', orderIndex: 2, startDate: day(31), endDate: day(90) } })
    const fixtures: { arm: ClassArm; student: Student; enrollment: Enrollment }[] = []
    for (const level of CLASS_LEVELS) {
      const arm = await db.classArm.create({ data: { schoolId: school.id, level, name: 'A', formTeacherId: ['JSS1', 'PRIMARY1'].includes(level) ? teacher.id : otherTeacher.id } })
      const student = await db.student.create({ data: { schoolId: school.id, fullName: `${level} Child`, regNumber: level, pin: '001234', classLevel: level } })
      const enrollment = await db.enrollment.create({ data: { schoolId: school.id, studentId: student.id, classArmId: arm.id, academicSessionId: session.id, sequence: 1, isCurrent: true, effectiveFrom: session.startDate } })
      fixtures.push({ arm, student, enrollment })
    }
    const one = fixtures.find(item => item.arm.level === 'JSS1')!
    const armB = await db.classArm.create({ data: { schoolId: school.id, level: 'JSS1', name: 'B', formTeacherId: otherTeacher.id } })
    const subject = await db.subject.create({ data: { schoolId: school.id, name: 'Math', normalizedName: 'math' } })
    await db.teachingAssignment.create({ data: { schoolId: school.id, teacherId: subjectTeacher.id, subjectId: subject.id, classArmId: one.arm.id, academicSessionId: session.id } })
    const foreignStudent = await root.student.create({ data: { schoolId: foreign.id, fullName: 'Foreign', regNumber: 'F', classLevel: 'JSS1', pin: '001234' } })
    const input = { termId: term.id, classArmId: one.arm.id, studentId: one.student.id, status: 'PAID' as const }

    await t.test('admin class filters cover nursery, primary and secondary; new terms start owing', async () => {
      const all = await feeRegister(adminCtx, { termId: term.id })
      assert.deepEqual(all.totals, { students: 14, paid: 0, owing: 14 })
      assert.equal(all.rows.some(row => 'pin' in row.student), false)
      for (const classLevel of CLASS_LEVELS) {
        const register = await feeRegister(adminCtx, { termId: term.id, classLevel })
        assert.equal(register.rows.length, 1)
        assert.equal(register.rows[0]!.classArm.level, classLevel)
      }
      const own = await feeRegister(teacherCtx, { termId: term.id })
      assert.equal(own.rows.length, 2)
      assert(own.rows.every(row => row.classArm.formTeacherId === teacher.id))
      assert.deepEqual((await feeRegister(subjectCtx, { termId: term.id })).rows, [])
    })

    await t.test('paid/owing toggles persist, record the updater and are idempotent', async () => {
      const paid = await setFeeStatus(teacherCtx, input)
      assert.equal(paid.status, 'PAID'); assert.equal(paid.updatedBy.fullName, teacher.fullName)
      const repeat = await setFeeStatus(teacherCtx, input)
      assert.equal(repeat.id, paid.id); assert.equal(repeat.updatedAt.getTime(), paid.updatedAt.getTime())
      assert.equal(await db.studentFee.count({ where: { studentId: one.student.id, termId: term.id } }), 1)
      assert.deepEqual((await feeRegister(adminCtx, { termId: term.id, classLevel: 'JSS1' })).totals, { students: 1, paid: 1, owing: 0 })
      assert.equal((await setFeeStatus(adminCtx, { ...input, status: 'OWING' })).status, 'OWING')
      await setFeeStatus(teacherCtx, input)
      assert.equal((await feeRegister(adminCtx, { termId: nextTerm.id, classLevel: 'JSS1' })).rows[0]!.status, 'OWING')
      await setFeeStatus(adminCtx, { ...input, termId: nextTerm.id, status: 'OWING' })
      assert.equal((await feeRegister(adminCtx, { termId: term.id, classLevel: 'JSS1' })).rows[0]!.status, 'PAID')
    })

    await t.test('subject teachers, wrong form teachers and cross-school IDs are rejected', async () => {
      for (const ctx of [subjectCtx, otherCtx]) {
        await assert.rejects(setFeeStatus(ctx, input), { code: 'FORBIDDEN' })
        await assert.rejects(feeRegister(ctx, { termId: term.id, classArmId: one.arm.id }), { code: 'FORBIDDEN' })
      }
      await assert.rejects(setFeeStatus(adminCtx, { ...input, studentId: foreignStudent.id }), { code: 'NOT_FOUND' })
      await assert.rejects(setFeeStatus(adminCtx, { ...input, termId: 'missing-term' }), { code: 'NOT_FOUND' })
      await assert.rejects(setFeeStatus(adminCtx, { ...input, studentId: fixtures.find(item => item.arm.level === 'JSS2')!.student.id }), { code: 'NOT_FOUND' })
      await assert.rejects(root.studentFee.create({ data: { schoolId: school.id, studentId: foreignStudent.id, termId: term.id, status: 'PAID', updatedById: admin.id } }), { code: 'P2003' })
    })

    await t.test('an arm transfer retains the term fee status and changes who can edit it', async () => {
      await db.enrollment.update({ where: { id: one.enrollment.id }, data: { isCurrent: false, effectiveTo: day(-1) } })
      await db.enrollment.create({ data: { schoolId: school.id, studentId: one.student.id, academicSessionId: session.id, classArmId: armB.id, sequence: 2, isCurrent: true, effectiveFrom: day(-1), reason: 'TRANSFER' } })
      assert.equal((await feeRegister(otherCtx, { termId: term.id, classArmId: armB.id })).rows[0]!.status, 'PAID')
      assert.equal((await feeRegister(teacherCtx, { termId: term.id, classArmId: one.arm.id })).rows.length, 0)
      await assert.rejects(setFeeStatus(teacherCtx, input), { code: 'NOT_FOUND' })
      await setFeeStatus(otherCtx, { ...input, classArmId: armB.id, status: 'OWING' })
      assert.equal(await db.studentFee.count({ where: { studentId: one.student.id, termId: term.id } }), 1)
    })

    await t.test('school dashboard totals stay scoped to the school', async () => {
      await root.user.create({ data: { schoolId: foreign.id, fullName: 'Foreign Teacher', role: 'TEACHER', email: `foreign-${suffix}@test.local`, passwordHash: 'unused' } })
      await db.parent.create({ data: { schoolId: school.id, fullName: 'Parent account', phone: '+2348000000000', pinHash: 'unused' } })
      const dashboard = await staffDashboard(adminCtx)
      assert.deepEqual(dashboard.totals, { students: 14, staff: 4 })
      assert.equal(dashboard.enrollmentCounts.reduce((sum, row) => sum + row.count, 0), 14)
      assert.equal((await staffDashboard(teacherCtx)).totals, null)
    })
  } finally {
    for (const schoolId of schoolIds) {
      const where = { schoolId }
      await root.parent.deleteMany({ where })
      await root.studentFee.deleteMany({ where }); await root.teachingAssignment.deleteMany({ where }); await root.enrollment.deleteMany({ where }); await root.term.deleteMany({ where }); await root.classArm.deleteMany({ where }); await root.subject.deleteMany({ where }); await root.academicSession.deleteMany({ where }); await root.student.deleteMany({ where }); await root.user.deleteMany({ where }); await root.school.deleteMany({ where: { id: schoolId } })
    }
    await root.$disconnect()
  }
})
