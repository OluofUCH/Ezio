import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TenantDb } from '@/lib/tenant'
import type { ReportSnapshot } from './service'
import type { ReportCard } from '@prisma/client'

export async function reportPdf(db: TenantDb, report: ReportCard) {
  const snapshot = report.snapshot as unknown as ReportSnapshot
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  const font = await document.embedFont(await readFile(join(process.cwd(), 'node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf')), { subset: true })
  let page = document.addPage([595, 842])
  let y = 796
  function line(text: string, size = 11) {
    const words = text.split(/\s+/)
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > 505 && current) { draw(current, size); current = word } else current = next
    }
    draw(current, size)
  }
  function draw(text: string, size: number) {
    if (y < 48) { page = document.addPage([595, 842]); y = 796 }
    page.drawText(text, { x: 45, y, size, font, color: rgb(0.1, 0.12, 0.1) })
    y -= size + 8
  }
  line(snapshot.school, 19)
  line('REPORT CARD', 14)
  line(`${snapshot.session} · ${snapshot.term}`)
  line(`${snapshot.student} · ${snapshot.admissionNumber}`)
  line(`Class: ${snapshot.className}`)
  const enrollment = await db.enrollment.findFirst({ where: { id: report.enrollmentId }, select: { studentId: true } })
  const photo = enrollment ? await db.studentPhoto.findFirst({ where: { studentId: enrollment.studentId }, select: { data: true } }) : null
  if (photo) {
    const image = await document.embedJpg(photo.data)
    page.drawImage(image, { x: 470, y: 688, width: 70, height: 70 })
  }
  y = Math.min(y, 665)
  for (const subject of snapshot.subjects) {
    line(`${subject.name}: ${subject.total.toFixed(2)} / 100 — ${subject.grade} (${subject.remark})`, 12)
    line(subject.components.map((component) => `${component.name}: ${component.value.toFixed(2)} / ${component.maxScore}`).join('    '), 9)
    y -= 6
  }
  y -= 12
  line(`Total: ${report.total}    Average: ${report.average}%    Position: ${report.position}`, 12)
  line(`Teacher remark: ${report.teacherRemark || '—'}`)
  line(`Principal remark: ${report.principalRemark || '—'}`)
  line(`${report.status} · Revision ${report.revision} · Approved ${report.approvedAt.toISOString().slice(0, 10)}`, 9)
  return document.save()
}
