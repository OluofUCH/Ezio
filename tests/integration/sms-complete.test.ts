import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import sharp from 'sharp'
import { NextRequest } from 'next/server'

test('remaining SMS modules work together with strict role and tenant boundaries', async (t) => {
  assert(process.env.SMS_TEST_DATABASE_URL, 'Set SMS_TEST_DATABASE_URL to the isolated migrated database.')
  Object.assign(process.env, { DATABASE_URL: process.env.SMS_TEST_DATABASE_URL, DIRECT_URL: process.env.SMS_TEST_DATABASE_URL, JWT_SECRET: 'complete-sms-tests-f522fab660954587b59273d34cab76a7', NODE_ENV: 'production' })
  const { unscopedDb: root } = await import('../../lib/db')
  const { tenantClient } = await import('../../lib/tenant')
  const { saveAssessment, saveScores, transitionResults, publishReports, ownReports, saveRemarks } = await import('../../src/modules/results/service')
  const { markAttendance, getRoll, studentAttendance } = await import('../../src/modules/attendance/service')
  const { createManagedStudent, updateManagedStudent, saveStudentPhoto, changeEnrollment, activateAcademicSession, assertStudentCanStart } = await import('../../src/modules/students/management')
  const { importCbtScores } = await import('../../src/modules/cbt-results/service')
  const { recordRosterGrant, wasEligibleOffline } = await import('../../src/modules/cbt-results/eligibility')
  const { postAnnouncement, listAnnouncements } = await import('../../src/modules/announcements/service')
  const { staffDashboard, studentDashboard } = await import('../../src/modules/dashboards/service')
  const { reportPdf } = await import('../../src/modules/results/pdf')
  const { studentWorkspaceGet } = await import('../../src/modules/workspace/handlers')
  const { reconcilePushedSession } = await import('../../lib/sync/reconcile')
  const { signStudentToken } = await import('../../lib/auth/jwt')
  const suffix = randomUUID()
  const schoolIds: string[] = []
  const date = '2026-10-29'
  try {
    await root.score.count({ where: { schoolId: '__complete_schema_probe__' } })
    const a = await root.school.create({ data: { name: 'Complete SMS A', slug: `complete-a-${suffix}` } }); schoolIds.push(a.id)
    const b = await root.school.create({ data: { name: 'Complete SMS B', slug: `complete-b-${suffix}` } }); schoolIds.push(b.id)
    async function user(schoolId: string, name: string, role: 'SCHOOL_ADMIN'|'TEACHER') { return root.user.create({ data: { schoolId, fullName: name, email: `${name}-${suffix}@test.local`, passwordHash: 'not-login', role } }) }
    const admin = await user(a.id, 'admin', 'SCHOOL_ADMIN'), teacher = await user(a.id, 'teacher', 'TEACHER'), teacher2 = await user(a.id, 'teacher2', 'TEACHER')
    await user(b.id, 'foreign', 'TEACHER')
    const db = tenantClient(a.id), other = tenantClient(b.id)
    const adminCtx = { db, schoolId: a.id, session: { typ: 'staff' as const, userId: admin.id, role: 'SCHOOL_ADMIN' as const, schoolId: a.id } }
    const teacherCtx = { db, schoolId: a.id, session: { typ: 'staff' as const, userId: teacher.id, role: 'TEACHER' as const, schoolId: a.id } }
    const teacher2Ctx = { db, schoolId: a.id, session: { typ: 'staff' as const, userId: teacher2.id, role: 'TEACHER' as const, schoolId: a.id } }
    const session = await db.academicSession.create({ data: { schoolId: a.id, name: '2026/2027', startDate: new Date('2026-09-01Z'), endDate: new Date('2027-07-31Z'), isCurrent: true } })
    const term = await db.term.create({ data: { schoolId: a.id, academicSessionId: session.id, name: 'First term', orderIndex: 1, startDate: new Date('2026-09-01Z'), endDate: new Date('2026-12-18Z') } })
    const armA = await db.classArm.create({ data: { schoolId: a.id, level: 'JSS2', name: 'A', isDefault: true, formTeacherId: teacher.id } })
    const armB = await db.classArm.create({ data: { schoolId: a.id, level: 'JSS2', name: 'B', formTeacherId: teacher2.id } })
    const math = await db.subject.create({ data: { schoolId: a.id, name: 'Mathematics', normalizedName: 'mathematics' } })
    const english = await db.subject.create({ data: { schoolId: a.id, name: 'English', normalizedName: 'english' } })
    await db.teachingAssignment.createMany({ data: [
      { schoolId: a.id, teacherId: teacher.id, classArmId: armA.id, subjectId: math.id, academicSessionId: session.id },
      { schoolId: a.id, teacherId: teacher.id, classArmId: armA.id, subjectId: english.id, academicSessionId: session.id },
      { schoolId: a.id, teacherId: teacher2.id, classArmId: armB.id, subjectId: math.id, academicSessionId: session.id },
    ] })
    const s1 = await createManagedStudent(adminCtx, { regNumber: 'A01', fullName: 'Ada One', classArmId: armA.id, pin: '001234' })
    const s2 = await createManagedStudent(adminCtx, { regNumber: 'A02', fullName: 'Ada Two', classArmId: armA.id, pin: '002345' })
    const s3 = await createManagedStudent(adminCtx, { regNumber: 'B01', fullName: 'Ben One', classArmId: armB.id, pin: '003456' })
    const enrollments = await db.enrollment.findMany({ where: { studentId: { in: [s1.id,s2.id,s3.id] } } })
    const e1 = enrollments.find(e=>e.studentId===s1.id)!, e2=enrollments.find(e=>e.studentId===s2.id)!, e3=enrollments.find(e=>e.studentId===s3.id)!
    await db.enrollment.updateMany({ where: { id: { in: [e1.id, e2.id, e3.id] } }, data: { effectiveFrom: session.startDate } })

    await t.test('student profiles and resized database photos preserve CBT identity', async () => {
      await updateManagedStudent(adminCtx, s1.id, { guardianName: 'Guardian One', guardianPhone: '0801', address: 'Lagos' })
      const before = await db.student.findFirstOrThrow({ where: { id: s1.id } })
      const png = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#4a6700' } }).png().toBuffer()
      await saveStudentPhoto(adminCtx, s1.id, png)
      const photo = await db.studentPhoto.findFirstOrThrow({ where: { studentId: s1.id } })
      assert.equal(photo.mimeType, 'image/jpeg'); assert(photo.data.length <= 262144)
      assert.deepEqual(await db.student.findFirstOrThrow({ where: { id: s1.id } }), before)
      assert.equal((await db.studentProfile.findFirstOrThrow({ where: { studentId: s1.id } })).guardianName, 'Guardian One')
      await assert.rejects(saveStudentPhoto({ ...adminCtx, db: other, schoolId: b.id, session: { ...adminCtx.session, schoolId: b.id } }, s1.id, png), { code: 'NOT_FOUND' })
    })

    await t.test('attendance is unique per enrollment/date and form-teacher-only for teachers', async () => {
      await markAttendance(teacherCtx, { classArmId: armA.id, termId: term.id, date, entries: [{ enrollmentId: e1.id, status: 'PRESENT' }, { enrollmentId: e2.id, status: 'LATE' }] })
      await markAttendance(teacherCtx, { classArmId: armA.id, termId: term.id, date, entries: [{ enrollmentId: e1.id, status: 'ABSENT' }] })
      assert.equal(await db.attendance.count({ where: { enrollmentId: e1.id, date: new Date(`${date}Z`) } }), 1)
      assert.equal((await getRoll(teacherCtx, { classArmId: armA.id, termId: term.id, date })).roster.find(r=>r.enrollmentId===e1.id)?.status, 'ABSENT')
      await assert.rejects(markAttendance(teacher2Ctx, { classArmId: armA.id, termId: term.id, date, entries: [{ enrollmentId: e1.id, status: 'PRESENT' }] }), { code: 'FORBIDDEN' })
      await assert.rejects(markAttendance(teacherCtx, { classArmId: armA.id, termId: term.id, date, entries: [{ enrollmentId: e3.id, status: 'PRESENT' }] }), { code: 'NOT_FOUND' })
      assert.equal((await studentAttendance(db, s1.id)).summary.absent, 1)
    })

    let components: { id:string; name:string; maxScore:number }[] = [], reportIds: string[] = []
    await t.test('score workflow locks approval, computes tied positions, audits corrections and publishes snapshots', async () => {
      const config = await saveAssessment(adminCtx, { components: [{ name:'CA',maxScore:40,orderIndex:0 },{name:'Exam',maxScore:60,orderIndex:1}], bands: [{minScore:0,maxScore:39.99,grade:'F',remark:'Fail'},{minScore:40,maxScore:59.99,grade:'C',remark:'Credit'},{minScore:60,maxScore:100,grade:'A',remark:'Excellent'}] })
      components = config.components
      const entries = (value:number) => [e1,e2].flatMap(e=>components.map(c=>({enrollmentId:e.id,componentId:c.id,value:c.name==='CA'?40:value})))
      for (const subject of [math,english]) {
        await saveScores(teacherCtx, { classArmId:armA.id,subjectId:subject.id,termId:term.id,entries:entries(60),reason:'' })
        const submission = await db.resultSubmission.findFirstOrThrow({ where:{classArmId:armA.id,subjectId:subject.id,termId:term.id} })
        await transitionResults(teacherCtx,{submissionId:submission.id,action:'SUBMIT'})
        const approved = await transitionResults(adminCtx,{submissionId:submission.id,action:'APPROVE'})
        if(subject.id===math.id) assert.equal(approved.reports.ready,false)
        else assert.equal(approved.reports.ready,true)
      }
      let reports = await db.reportCard.findMany({ where:{classArmId:armA.id,termId:term.id}, orderBy:{id:'asc'} })
      assert.equal(reports.length,2); assert.deepEqual(reports.map(r=>r.position),[1,1])
      await assert.rejects(saveScores(teacherCtx,{classArmId:armA.id,subjectId:math.id,termId:term.id,entries:[{enrollmentId:e1.id,componentId:components[0]!.id,value:35}],reason:'Teacher correction'}),{code:'FORBIDDEN'})
      const revision = reports.find(r=>r.enrollmentId===e1.id)!.revision
      await saveScores(adminCtx,{classArmId:armA.id,subjectId:math.id,termId:term.id,entries:[{enrollmentId:e1.id,componentId:components[0]!.id,value:35}],reason:'Verified admin correction'})
      assert.equal((await db.scoreAuditLog.count({where:{reason:'Verified admin correction'}})),1)
      assert.equal((await db.reportCard.findFirstOrThrow({where:{enrollmentId:e1.id,termId:term.id}})).revision,revision+1)
      await saveRemarks(teacherCtx,{reportId:reports.find(r=>r.enrollmentId===e1.id)!.id,teacherRemark:'Works hard'})
      await assert.rejects(saveRemarks(teacherCtx,{reportId:reports.find(r=>r.enrollmentId===e1.id)!.id,principalRemark:'No'}),{code:'FORBIDDEN'})
      await publishReports(adminCtx,{classArmId:armA.id,termId:term.id})
      reports=await db.reportCard.findMany({where:{classArmId:armA.id,termId:term.id}}); assert(reports.every(r=>r.status==='PUBLISHED'))
      reportIds=reports.map(r=>r.id); assert.equal((await ownReports(db,s1.id)).length,1)
      const bytes=await reportPdf(db,await db.reportCard.findFirstOrThrow({where:{id:reportIds[0]}})); assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF')
    })

    await t.test('CBT bridge imports only eligible finalized attempts and manual edits flip provenance', async () => {
      const science=await db.subject.create({data:{schoolId:a.id,name:'Science',normalizedName:'science'}})
      await db.teachingAssignment.create({data:{schoolId:a.id,teacherId:teacher.id,classArmId:armA.id,subjectId:science.id,academicSessionId:session.id}})
      const exam=await db.exam.create({data:{schoolId:a.id,createdById:teacher.id,title:'Science CBT',subject:'Science',subjectId:science.id,termId:term.id,componentId:components[1]!.id,classLevel:'JSS2',durationMins:30,startWindow:new Date('2026-10-01Z'),endWindow:new Date('2026-10-20Z'),isPublished:true}})
      const q=await db.question.create({data:{examId:exam.id,text:'Question',points:10,orderIndex:0,options:{create:[{text:'Yes',isCorrect:true,orderIndex:0},{text:'No',isCorrect:false,orderIndex:1}]}}})
      await db.examSession.createMany({data:[
        {examId:exam.id,studentId:s1.id,status:'SUBMITTED',startedAt:new Date('2026-10-10T09:00Z'),submittedAt:new Date('2026-10-10T09:10Z'),score:5,maxScore:10},
        {examId:exam.id,studentId:s1.id,status:'SUBMITTED',startedAt:new Date('2026-10-11T09:00Z'),submittedAt:new Date('2026-10-11T09:10Z'),score:8,maxScore:10},
        {examId:exam.id,studentId:s2.id,localServerId:null,localId:'device-only',status:'SUBMITTED',startedAt:new Date('2026-10-11T09:00Z'),submittedAt:new Date('2026-10-11T09:10Z'),score:10,maxScore:10},
      ]})
      const result=await importCbtScores(teacherCtx,{examId:exam.id,componentId:components[1]!.id,attemptRule:'BEST'}); assert.equal(result.imported,1)
      const score=await db.score.findFirstOrThrow({where:{enrollmentId:e1.id,subjectId:science.id}}); assert.equal(Number(score.value),48); assert.equal(score.source,'CBT')
      assert.equal(await db.score.count({where:{enrollmentId:e2.id,subjectId:science.id}}),0)
      await saveScores(teacherCtx,{classArmId:armA.id,subjectId:science.id,termId:term.id,entries:[{enrollmentId:e1.id,componentId:components[1]!.id,value:47}],reason:''})
      assert.equal((await db.score.findFirstOrThrow({where:{id:score.id}})).source,'MANUAL')
      assert.equal(await db.scoreAuditLog.count({where:{scoreId:score.id}}),2)
      assert.equal(q.examId,exam.id)
    })

    await t.test('staff-only announcements and dashboards enforce audience and principal type', async () => {
      await postAnnouncement(adminCtx,{title:'All',body:'All staff',audience:'ALL_STAFF'})
      await postAnnouncement(adminCtx,{title:'Teachers',body:'Teachers',audience:'ROLE',targetRole:'TEACHER'})
      await postAnnouncement(adminCtx,{title:'Arm A',body:'Assigned staff',audience:'CLASS_ARM',classArmId:armA.id})
      assert.equal((await listAnnouncements(teacherCtx)).length,3)
      assert.equal((await listAnnouncements(teacher2Ctx)).some(a=>a.title==='Arm A'),false)
      const studentToken=await signStudentToken({sub:s1.id,schoolId:a.id,classLevel:'JSS2'})
      const request=new NextRequest('http://sms.test/api/sms/student/workspace/announcements',{headers:{authorization:`Bearer ${studentToken}`}})
      await assert.rejects(studentWorkspaceGet(request,'announcements'),{code:'FORBIDDEN'})
      assert((await staffDashboard(adminCtx)).work.length>=2); assert.equal((await studentDashboard(db,s1.id)).reports.length,1)
      await assert.rejects(postAnnouncement(teacherCtx,{title:'No',body:'No',audience:'ALL_STAFF'}),{code:'FORBIDDEN'})
    })

    await t.test('placement history supports arm moves, withdrawal, rollover, and late LAN eligibility', async () => {
      await changeEnrollment(adminCtx,{studentId:s3.id,academicSessionId:session.id,classArmId:armA.id,reason:'TRANSFER',effectiveDate:date,transferOut:false})
      assert.equal((await db.student.findFirstOrThrow({where:{id:s3.id}})).classLevel,'JSS2')
      const hall=await db.localServer.create({data:{schoolId:a.id,name:'Eligibility Hall'}})
      const exam=await db.exam.create({data:{schoolId:a.id,createdById:teacher.id,title:'Historical paper',subject:'Math',classLevel:'JSS2',durationMins:30,isPublished:true}})
      const question=await db.question.create({data:{examId:exam.id,text:'Historical question',points:1,orderIndex:0,options:{create:[{text:'Yes',isCorrect:true,orderIndex:0},{text:'No',isCorrect:false,orderIndex:1}]}},include:{options:true}})
      await recordRosterGrant(db,a.id,hall.id,exam.id,'JSS2',[s3.id])
      await changeEnrollment(adminCtx,{studentId:s3.id,academicSessionId:session.id,reason:'TRANSFER',effectiveDate:date,transferOut:true})
      await assert.rejects(assertStudentCanStart(db,s3.id),{code:'FORBIDDEN'})
      assert.equal(await wasEligibleOffline(db,hall.id,{id:exam.id,classLevel:'JSS2',termId:null},s3.id,new Date('2026-10-28Z')),true)
      const synced=await reconcilePushedSession(db,hall.id,{localId:`late-${suffix}`,examId:exam.id,studentId:s3.id,status:'SUBMITTED',startedAt:new Date('2026-10-28T09:00Z'),submittedAt:new Date('2026-10-28T09:10Z'),syncVersion:1,answers:[{questionId:question.id,selectedOptionIds:[question.options.find(option=>option.isCorrect)!.id]}]},new Date('2026-10-30Z'))
      assert.equal(synced.outcome,'CREATED')
      const future=await db.academicSession.create({data:{schoolId:a.id,name:'2027/2028',startDate:new Date('2027-09-01Z'),endDate:new Date('2028-07-31Z')}})
      const jss3=await db.classArm.create({data:{schoolId:a.id,level:'JSS3',name:'A',isDefault:true}})
      for(const student of [s1,s2]) await changeEnrollment(adminCtx,{studentId:student.id,academicSessionId:future.id,classArmId:jss3.id,reason:'PROMOTION',effectiveDate:'2027-09-01',transferOut:false})
      const rollover=await activateAcademicSession(adminCtx,future.id); assert.equal(rollover.students,2)
      assert.equal((await db.student.findFirstOrThrow({where:{id:s1.id}})).classLevel,'JSS3')
      assert.equal((await db.enrollment.findFirstOrThrow({where:{studentId:s1.id,isCurrent:true}})).academicSessionId,future.id)
    })

    await t.test('cross-tenant IDs remain unusable across remaining modules', async () => {
      const foreign=await other.classArm.create({data:{schoolId:b.id,level:'JSS2',name:'Foreign'}})
      await assert.rejects(getRoll(adminCtx,{classArmId:foreign.id,termId:term.id,date}),{code:'NOT_FOUND'})
      await assert.rejects(postAnnouncement(adminCtx,{title:'Foreign',body:'No',audience:'CLASS_ARM',classArmId:foreign.id}),{code:'NOT_FOUND'})
      assert.equal((await ownReports(other,s1.id)).length,0)
    })
  } finally {
    try {
      for(const schoolId of schoolIds){
        const where={schoolId}
        await root.scoreAuditLog.deleteMany({where});await root.score.deleteMany({where});await root.reportCard.deleteMany({where});await root.resultSubmission.deleteMany({where});await root.termResultPolicy.deleteMany({where});await root.attendance.deleteMany({where});await root.announcement.deleteMany({where});await root.offlineRosterGrant.deleteMany({where});await root.examSession.deleteMany({where:{exam:{schoolId}}});await root.exam.deleteMany({where});await root.teachingAssignment.deleteMany({where});await root.studentPhoto.deleteMany({where});await root.studentProfile.deleteMany({where});await root.enrollment.deleteMany({where});await root.assessmentComponent.deleteMany({where});await root.gradeBand.deleteMany({where});await root.term.deleteMany({where});await root.classArm.deleteMany({where});await root.subject.deleteMany({where});await root.academicSession.deleteMany({where});await root.localServer.deleteMany({where});await root.student.deleteMany({where});await root.user.deleteMany({where});await root.school.deleteMany({where:{id:schoolId}})
      }
    } finally {await root.$disconnect()}
  }
})
