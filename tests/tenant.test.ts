import assert from 'node:assert/strict'
import test from 'node:test'
import { tenantClient } from '../lib/tenant'

// The final query extension records the real scoped arguments without calling
// Prisma's database executor. These tests never connect to a database.
function probe() {
  const calls: { model: string | undefined; operation: string; args: unknown }[] = []
  const db = tenantClient('school-a').$extends({
    query: {
      async $allOperations({ model, operation, args }) {
        calls.push({ model, operation, args })
        return []
      },
    },
  })
  return { db, calls }
}

test('every foundation model automatically receives authenticated school scope', async () => {
  const { db, calls } = probe()
  await db.academicSession.findMany()
  await db.term.findMany()
  await db.classArm.findMany()
  await db.subject.findMany()
  await db.enrollment.findMany()
  await db.assessmentComponent.findMany()
  assert.equal(calls.length, 6)
  for (const call of calls) assert.deepEqual(call.args, { where: { schoolId: 'school-a' } }, call.model)
})

test('teacher profiles and teaching assignments inherit the same automatic tenant scope', async () => {
  const { db, calls } = probe()
  await db.teacherProfile.findMany()
  await db.teachingAssignment.findMany()
  assert.equal(calls.length, 2)
  for (const call of calls) assert.deepEqual(call.args, { where: { schoolId: 'school-a' } }, call.model)
})

test('OR branches and a supplied school cannot replace the mandatory tenant filter', async () => {
  const { db, calls } = probe()
  const where = { OR: [{ schoolId: 'school-b' }, { name: { contains: 'Math' } }] }
  await db.subject.findMany({ where })
  assert.deepEqual(calls[0]?.args, { where: { AND: [where, { schoolId: 'school-a' }] } })
  await db.subject.findUnique({ where: { id: 'foreign-id', schoolId: 'school-b' } })
  assert.deepEqual(calls[1]?.args, { where: { id: 'foreign-id', schoolId: 'school-a' } })
})

test('bulk creation stamps every row and upsert scopes both lookup and creation', async () => {
  const { db, calls } = probe()
  await db.subject.createMany({ data: [{ schoolId: 'school-b', name: 'Math', normalizedName: 'math' }] })
  assert.deepEqual(calls[0]?.args, { data: [{ schoolId: 'school-a', name: 'Math', normalizedName: 'math' }] })
  await db.subject.upsert({
    where: { id: 'subject-id' },
    create: { schoolId: 'school-b', name: 'Math', normalizedName: 'math' }, update: {},
  })
  assert.deepEqual(calls[1]?.args, {
    where: { id: 'subject-id', schoolId: 'school-a' },
    create: { schoolId: 'school-a', name: 'Math', normalizedName: 'math' }, update: {},
  })
})

test('tenant reassignment and nested connection bypasses fail before database execution', async () => {
  const { db, calls } = probe()
  await assert.rejects(db.subject.update({ where: { id: 'subject-id' }, data: { schoolId: 'school-b' } }), { code: 'CONFIGURATION_ERROR' })
  await assert.rejects(db.subject.create({
    data: { name: 'Math', normalizedName: 'math', school: { connect: { id: 'school-b' } } },
  }), { code: 'CONFIGURATION_ERROR' })
  assert.equal(calls.length, 0)
})

test('raw operations and unscoped global models are unavailable on a tenant client', async () => {
  const { db, calls } = probe()
  await assert.rejects(db.$queryRawUnsafe('SELECT 1'), { code: 'CONFIGURATION_ERROR' })
  await assert.rejects(db.authThrottle.findMany(), { code: 'CONFIGURATION_ERROR' })
  assert.equal(calls.length, 0)
})

test('CBT relation filtering and resolved Answer upserts retain their existing contract', async () => {
  const { db, calls } = probe()
  await db.examSession.findMany({ where: { studentId: 'student-a' } })
  assert.deepEqual(calls[0]?.args, {
    where: { AND: [{ studentId: 'student-a' }, { exam: { schoolId: 'school-a' } }] },
  })
  await db.answer.upsert({
    where: { examSessionId_questionId: { examSessionId: 'resolved-session', questionId: 'resolved-question' } },
    create: { examSessionId: 'resolved-session', questionId: 'resolved-question' }, update: {},
  })
  assert.equal(calls.length, 2)
})
