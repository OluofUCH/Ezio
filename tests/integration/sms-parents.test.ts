import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NextRequest } from 'next/server'

test('parents see only linked published results and exchange comments with the current form teacher', async t => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to an isolated migrated database.')
  Object.assign(process.env, { DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL, JWT_SECRET: 'parent-integration-test-secret-at-least-32-characters' })
  const { unscopedDb: root } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const parents = await import('../../src/modules/parents/service')
  const { updateManagedStudent } = await import('../../src/modules/students/management')
  const { parentWorkspaceGet } = await import('../../src/modules/parents/handlers')
  const { signParentToken, signStaffToken, signStudentToken } = await import('../../lib/auth/jwt')
  const { requireParent } = await import('../../lib/auth/parent')
  const { requireStaff, requireStudent } = await import('../../lib/auth/session')
  const { POST: login } = await import('../../app/api/auth/parent/login/route')
  const suffix = randomUUID(), schoolIds: string[] = []
  const request = (path: string, token: string) => new NextRequest(`http://sms.test/${path}`, { headers: { authorization: `Bearer ${token}` } })
  try {
    const school = await root.school.create({ data: { name: 'Parent test A', slug: `parent-a-${suffix}` } }); schoolIds.push(school.id)
    const foreign = await root.school.create({ data: { name: 'Parent test B', slug: `parent-b-${suffix}` } }); schoolIds.push(foreign.id)
    const db = tenantClient(school.id)
    const staff = async (name: string, role: 'SCHOOL_ADMIN' | 'TEACHER') => root.user.create({ data: { schoolId: school.id, email: `${name}-${suffix}@test.local`, fullName: name, passwordHash: 'unused', role } })
    const admin = await staff('Admin', 'SCHOOL_ADMIN'), teacher = await staff('Teacher', 'TEACHER'), otherTeacher = await staff('Other', 'TEACHER')
    const context = (user: typeof admin) => ({ schoolId: school.id, db, session: { typ: 'staff' as const, userId: user.id, role: user.role, schoolId: school.id } })
    const adminCtx = context(admin), teacherCtx = context(teacher), otherCtx = context(otherTeacher)
    const session = await db.academicSession.create({ data: { schoolId: school.id, name: '2026/2027', startDate: new Date('2026-09-01Z'), endDate: new Date('2027-07-31Z'), isCurrent: true } })
    const term = await db.term.create({ data: { schoolId: school.id, academicSessionId: session.id, name: 'First term', orderIndex: 1, startDate: session.startDate, endDate: new Date('2026-12-18Z') } })
    const arm = await db.classArm.create({ data: { schoolId: school.id, level: 'PRIMARY1', name: 'A', formTeacherId: teacher.id } })
    const otherArm = await db.classArm.create({ data: { schoolId: school.id, level: 'PRIMARY1', name: 'B', formTeacherId: otherTeacher.id } })
    const child = async (name: string, classArmId: string) => {
      const student = await db.student.create({ data: { schoolId: school.id, fullName: name, regNumber: name, pin: '001234', classLevel: 'PRIMARY1' } })
      const enrollment = await db.enrollment.create({ data: { schoolId: school.id, studentId: student.id, classArmId, academicSessionId: session.id, sequence: 1, isCurrent: true, effectiveFrom: session.startDate } })
      return { student, enrollment }
    }
    const one = await child('Child One', arm.id), two = await child('Child Two', arm.id), sibling = await child('Sibling', otherArm.id)
    const foreignChild = await root.student.create({ data: { schoolId: foreign.id, fullName: 'Foreign Child', regNumber: 'FOREIGN', pin: '001234', classLevel: 'NURSERY1' } })
    await updateManagedStudent(adminCtx, one.student.id, { guardianName: 'Parent One', guardianPhone: '08012345678' })
    await updateManagedStudent(adminCtx, two.student.id, { guardianName: 'Parent Two', guardianPhone: '08012345679' })
    const parent = await db.parent.findFirstOrThrow({ where: { phone: '+2348012345678' }, include: { children: true } })
    const second = await db.parent.findFirstOrThrow({ where: { phone: '+2348012345679' }, include: { children: true } })
    const parentCtx = { schoolId: school.id, db, session: { typ: 'parent' as const, parentId: parent.id, schoolId: school.id, authVersion: 1 } }
    const link = parent.children[0]!.id, secondLink = second.children[0]!.id
    const token = await signParentToken({ sub: parent.id, schoolId: school.id, authVersion: 1 })
    const snapshot = { school: school.name, student: one.student.fullName, admissionNumber: one.student.regNumber, className: 'Primary 1 A', session: session.name, term: term.name, subjects: [{ id: 'math', name: 'Math', total: 80, grade: 'A', remark: 'Excellent', components: [] }] }
    const report = await db.reportCard.create({ data: { schoolId: school.id, enrollmentId: one.enrollment.id, classArmId: arm.id, termId: term.id, total: 80, average: 80, position: 1, subjectCount: 1, snapshot } })
    const otherReport = await db.reportCard.create({ data: { schoolId: school.id, enrollmentId: two.enrollment.id, classArmId: arm.id, termId: term.id, total: 90, average: 90, position: 1, subjectCount: 1, status: 'PUBLISHED', snapshot: { ...snapshot, student: two.student.fullName } } })

    await t.test('phone/PIN login creates a separate cookie and hides stored PIN hashes', async () => {
      const response = await login(new NextRequest('http://sms.test/api/auth/parent/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.10.0.1' }, body: JSON.stringify({ schoolSlug: school.slug, phone: '+234 801 234 5678', pin: '1234' }) }), { params: Promise.resolve({}) })
      assert.equal(response.status, 200)
      assert(response.cookies.get('sms_parent')?.value)
      assert(!JSON.stringify(await response.json()).includes('pinHash'))
      assert(!JSON.stringify(await parents.listParents(adminCtx, { page: 1, pageSize: 50 })).includes('pinHash'))
      assert.equal((await requireParent(request('api/sms/parent/workspace/children', token))).parent.id, parent.id)
      await assert.rejects(requireStaff(request('api/sms/staff/workspace/dashboard', token)), { code: 'UNAUTHENTICATED' })
      await assert.rejects(requireStudent(request('api/sms/student/workspace/dashboard', token)), { code: 'UNAUTHENTICATED' })
      const staffToken = await signStaffToken({ sub: teacher.id, role: 'TEACHER', schoolId: school.id })
      const studentToken = await signStudentToken({ sub: one.student.id, schoolId: school.id, classLevel: 'PRIMARY1' })
      for (const wrong of [staffToken, studentToken]) await assert.rejects(requireParent(request('api/sms/parent/workspace/children', wrong)), { code: 'UNAUTHENTICATED' })
    })

    await t.test('results and PDF downloads require both publication and a current child link', async () => {
      assert.deepEqual(await parents.childReports(parentCtx, one.student.id), [])
      await assert.rejects(parentWorkspaceGet(request(`api/sms/parent/workspace/report-pdf?id=${report.id}`, token), 'report-pdf'), { code: 'NOT_FOUND' })
      await db.reportCard.update({ where: { id: report.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
      assert.equal((await parents.childReports(parentCtx, one.student.id)).length, 1)
      await db.reportCard.update({ where: { id: report.id }, data: { snapshot: { ...snapshot, student: one.student.id } } })
      assert.equal((await parents.childReports(parentCtx, one.student.id))[0]!.snapshot.student, one.student.fullName)
      for (const student of [two.student, foreignChild]) await assert.rejects(parents.childReports(parentCtx, student.id), { code: 'NOT_FOUND' })
      await assert.rejects(parentWorkspaceGet(request(`api/sms/parent/workspace/report-pdf?id=${otherReport.id}`, token), 'report-pdf'), { code: 'NOT_FOUND' })
      const pdf = await parentWorkspaceGet(request(`api/sms/parent/workspace/report-pdf?id=${report.id}`, token), 'report-pdf')
      assert.equal(pdf.headers.get('content-type'), 'application/pdf')
      assert.match(pdf.headers.get('content-disposition') ?? '', /Child One/)
      assert(!(pdf.headers.get('content-disposition') ?? '').includes(report.id))
      assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF')
      for (const area of ['fees', 'attendance', 'dashboard']) await assert.rejects(parentWorkspaceGet(request(`api/sms/parent/workspace/${area}`, token), area), { code: 'NOT_FOUND' })
    })

    await t.test('parents and form teachers can start conversations, with no access to other families', async () => {
      await parents.postComment(parentCtx, { parentStudentId: link, body: 'How can we support her reading?' })
      await parents.postComment(teacherCtx, { parentStudentId: link, body: 'Please read together every evening.' })
      const comments = await parents.listComments(parentCtx, { parentStudentId: link, page: 1, pageSize: 50 })
      assert.deepEqual(comments.comments.map(comment => comment.author), ['PARENT', 'TEACHER'])
      await assert.rejects(parents.listComments(parentCtx, { parentStudentId: secondLink, page: 1, pageSize: 50 }), { code: 'NOT_FOUND' })
      await assert.rejects(parents.postComment(otherCtx, { parentStudentId: link, body: 'Not my class' }), { code: 'NOT_FOUND' })
      await assert.rejects(parents.postComment(adminCtx, { parentStudentId: link, body: 'Not a form teacher' }), { code: 'FORBIDDEN' })
      assert.equal((await parents.teacherFamilies(teacherCtx, { page: 1, pageSize: 50 })).families.length, 2)
      await parents.postComment(teacherCtx, { parentStudentId: secondLink, body: 'A teacher can start a conversation too.' })
      await updateManagedStudent(adminCtx, sibling.student.id, { guardianName: 'Parent One', guardianPhone: '08012345678' })
      assert.equal((await parents.parentChildren(parentCtx)).length, 2)
    })

    await t.test('form teacher changes and unlinks immediately change conversation access', async () => {
      await db.classArm.update({ where: { id: arm.id }, data: { formTeacherId: otherTeacher.id } })
      await assert.rejects(parents.postComment(teacherCtx, { parentStudentId: link, body: 'Former teacher' }), { code: 'NOT_FOUND' })
      await parents.postComment(otherCtx, { parentStudentId: link, body: 'I am the new form teacher.' })
      await updateManagedStudent(adminCtx, one.student.id, { guardianPhone: null })
      await assert.rejects(parents.childReports(parentCtx, one.student.id), { code: 'NOT_FOUND' })
      await assert.rejects(parents.postComment(parentCtx, { parentStudentId: link, body: 'Unlinked' }), { code: 'NOT_FOUND' })
      await updateManagedStudent(adminCtx, one.student.id, { guardianPhone: '08012345678' })
      assert.equal((await parents.listComments(parentCtx, { parentStudentId: link, page: 1, pageSize: 50 })).comments.length, 3)
      await db.classArm.update({ where: { id: arm.id }, data: { formTeacherId: null } })
      await assert.rejects(parents.postComment(parentCtx, { parentStudentId: link, body: 'No assigned teacher' }), { code: 'CONFLICT' })
    })

    await t.test('parent management enforces tenant boundaries and PIN reset revokes prior sessions', async () => {
      await assert.rejects(updateManagedStudent(teacherCtx, one.student.id, { guardianName: 'Bad Parent', guardianPhone: '08012345670' }), { code: 'FORBIDDEN' })
      await assert.rejects(updateManagedStudent(adminCtx, foreignChild.id, { guardianName: 'Parent One', guardianPhone: '08012345678' }), { code: 'NOT_FOUND' })
      await assert.rejects(root.parentStudent.create({ data: { schoolId: school.id, parentId: parent.id, studentId: foreignChild.id } }), { code: 'P2003' })
      await parents.updateParent(adminCtx, { parentId: parent.id, pin: '009999' })
      await assert.rejects(requireParent(request('api/sms/parent/workspace/children', token)), { code: 'UNAUTHENTICATED' })
      const updatedToken = await signParentToken({ sub: parent.id, schoolId: school.id, authVersion: 2 })
      await parents.updateParent(adminCtx, { parentId: parent.id, isActive: false })
      await assert.rejects(requireParent(request('api/sms/parent/workspace/children', updatedToken)), { code: 'FORBIDDEN' })
    })
  } finally {
    for (const schoolId of schoolIds) {
      const where = { schoolId }
      await root.parentComment.deleteMany({ where }); await root.parentStudent.deleteMany({ where }); await root.parent.deleteMany({ where })
      await root.studentProfile.deleteMany({ where })
      await root.reportCard.deleteMany({ where }); await root.enrollment.deleteMany({ where }); await root.term.deleteMany({ where }); await root.classArm.deleteMany({ where }); await root.academicSession.deleteMany({ where })
      await root.student.deleteMany({ where }); await root.user.deleteMany({ where }); await root.auditLog.deleteMany({ where }); await root.school.deleteMany({ where: { id: schoolId } })
    }
    await root.$disconnect()
  }
})
