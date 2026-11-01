import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { Prisma, type ReportCard } from '@prisma/client'
import type { TenantDb } from '../lib/tenant'
import { reportPdf } from '../src/modules/results/pdf'
import { reportDownloadHeaders } from '../src/modules/results/download'

const report: ReportCard = {
  id: 'report', schoolId: 'school', enrollmentId: 'enrollment', classArmId: 'arm', termId: 'term',
  total: new Prisma.Decimal(85), average: new Prisma.Decimal(85), position: 1, subjectCount: 1,
  status: 'PUBLISHED', revision: 1, teacherRemark: 'Good progress.', principalRemark: null,
  approvedAt: new Date('2026-10-31Z'), publishedAt: new Date('2026-10-31Z'), updatedAt: new Date('2026-10-31Z'),
  snapshot: { school: 'Test School', student: 'Adéọlá Student', admissionNumber: 'P001', className: 'Primary 1 A', session: '2026/2027', term: 'First term', subjects: [
    { id: 'math', name: 'Mathematics', total: 85, grade: 'A', remark: 'Excellent', components: [{ id: 'ca', name: 'CA', maxScore: 40, value: 35, source: 'MANUAL' }, { id: 'exam', name: 'Exam', maxScore: 60, value: 50, source: 'MANUAL' }] },
  ] },
}

test('Unicode report PDFs also render without an uploaded photo', async () => {
  const db = {
    enrollment: { findFirst: async () => ({ studentId: 'student' }) },
    studentPhoto: { findFirst: async () => null },
  } as unknown as TenantDb
  const bytes = await reportPdf(db, report)
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1)
})

test('report PDFs support student photos supplied as a view into a larger byte buffer', async () => {
  const jpeg = await sharp({ create: { width: 32, height: 40, channels: 3, background: '#4a6700' } }).jpeg().toBuffer()
  const storage = new Uint8Array(jpeg.length + 32)
  storage.set(jpeg, 16)
  const data = storage.subarray(16, 16 + jpeg.length)
  assert.notEqual(data.byteOffset, 0)
  const db = {
    enrollment: { findFirst: async () => ({ studentId: 'student' }) },
    studentPhoto: { findFirst: async () => ({ data }) },
  } as unknown as TenantDb
  const bytes = await reportPdf(db, report)
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF')
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1)
})

test('report filenames use the student name and term, with safe Unicode download headers', () => {
  const headers = reportDownloadHeaders({ student: 'Old name', session: '2026/2027', term: 'First term' }, 'Adéọlá Student')
  assert.match(headers['content-disposition'], /filename="Adeola Student - 2026-2027 - First term - Report card\.pdf"/)
  assert.match(headers['content-disposition'], /filename\*=UTF-8''Ad%C3%A9%E1%BB%8Dl%C3%A1%20Student/)
  assert(!headers['content-disposition'].includes('Old name'))
  const unsafe = reportDownloadHeaders({ student: 'A\r\n"/\\Child', session: '2026/2027', term: 'Term: 1' })
  assert(!/[\r\n]/.test(unsafe['content-disposition']))
  assert.equal(new Headers(unsafe).get('content-type'), 'application/pdf')
})

test('PDF metadata uses the student’s current name rather than an old snapshot label', async () => {
  const db = {
    enrollment: { findFirst: async () => ({ studentId: 'student', student: { fullName: 'Current Student Name' } }) },
    studentPhoto: { findFirst: async () => null },
  } as unknown as TenantDb
  const pdf = await PDFDocument.load(await reportPdf(db, report))
  assert.match(pdf.getTitle() ?? '', /^Current Student Name/)
})
