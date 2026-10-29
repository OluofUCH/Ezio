import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFString, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

// Standalone document generation; this is not an application route.
const root = new URL('../', import.meta.url)
const require = createRequire(import.meta.url)
const source = await readFile(new URL('docs/site-guide.md', root), 'utf8')
const sections = source.split(/^## /m).slice(1).map((section) => {
  const [title, ...lines] = section.split(/\r?\n/)
  return { title: title.trim(), lines }
})
assert(sections.length > 0, 'The guide needs at least one section.')

const pdf = await PDFDocument.create()
pdf.registerFontkit(fontkit)
pdf.setTitle('Ezio Nigeria — Site navigation & workflow guide')
pdf.setAuthor('Ezio Nigeria')
pdf.setSubject('SMS navigation, role-based workflows, CBT exams and offline hall operation')
pdf.setCreator('Ezio standalone guide generator')
pdf.catalog.set(PDFName.of('Lang'), PDFString.of('en-GB'))
const fonts = {}
for (const [name, file] of [['body', 'DejaVuSans.ttf'], ['bold', 'DejaVuSans-Bold.ttf'], ['mono', 'DejaVuSansMono.ttf']]) {
  fonts[name] = await pdf.embedFont(await readFile(require.resolve(`dejavu-fonts-ttf/ttf/${file}`)), { subset: true })
}

const W = 595.28, H = 841.89, M = 48, WIDTH = W - 2 * M, BOTTOM = 62
const palette = {
  ink: rgb(0.12, 0.16, 0.12), muted: rgb(0.34, 0.39, 0.34), green: rgb(0.23, 0.34, 0.07),
  lime: rgb(0.66, 0.85, 0.24), paper: rgb(0.965, 0.977, 0.943), rule: rgb(0.85, 0.88, 0.83),
}
let page, y, currentTitle = ''
const sectionPages = []
const bodySize = 10.6, lineHeight = 16.5

function text(value, x, baseline, size = bodySize, font = fonts.body, color = palette.ink, target = page) {
  assert(baseline >= 24 && baseline <= H - 20, `Text outside the printable page: ${value}`)
  assert(x >= M - 1 && x + font.widthOfTextAtSize(value, size) <= W - M + 1, `Text exceeds page width: ${value}`)
  target.drawText(value, { x, y: baseline, size, font, color })
}

function inlineWords(value) {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).flatMap((part) => {
    const bold = part.startsWith('**'), mono = part.startsWith('`')
    const content = bold ? part.slice(2, -2) : mono ? part.slice(1, -1) : part
    return content.split(/(\s+)/).filter(Boolean).map((word) => ({
      word, font: bold ? fonts.bold : mono ? fonts.mono : fonts.body,
    }))
  })
}

function wrap(value, width, size = bodySize, forcedFont) {
  const lines = [], spaceWidth = fonts.body.widthOfTextAtSize(' ', size)
  let line = [], lineWidth = 0, pendingSpace = false
  const push = () => { if (line.length) lines.push(line); line = []; lineWidth = 0; pendingSpace = false }
  for (const token of inlineWords(value)) {
    if (/^\s+$/.test(token.word)) { pendingSpace = line.length > 0; continue }
    const font = forcedFont ?? token.font
    let word = token.word
    let wordWidth = font.widthOfTextAtSize(word, size)
    if (line.length && lineWidth + (pendingSpace ? spaceWidth : 0) + wordWidth > width) push()
    // Long paths can wrap within the token instead of falling outside the page.
    while (wordWidth > width) {
      let piece = ''
      for (const char of word) {
        if (font.widthOfTextAtSize(piece + char, size) > width) break
        piece += char
      }
      assert(piece, 'The text column is too narrow.')
      line.push({ word: piece, font, gap: 0 })
      push()
      word = word.slice(piece.length)
      wordWidth = font.widthOfTextAtSize(word, size)
    }
    if (word) {
      const gap = pendingSpace && line.length ? spaceWidth : 0
      line.push({ word, font, gap })
      lineWidth += gap + wordWidth
    }
    pendingSpace = false
  }
  push()
  return lines
}

function drawLine(line, x, baseline, size = bodySize, color = palette.ink) {
  for (const run of line) {
    x += run.gap
    text(run.word, x, baseline, size, run.font, color)
    x += run.font.widthOfTextAtSize(run.word, size)
  }
}

function newBodyPage(continued = false) {
  page = pdf.addPage([W, H])
  text('EZIO NIGERIA', M, H - 38, 8.2, fonts.bold, palette.green)
  text('SMS · CBT · SITE GUIDE', W - M - fonts.body.widthOfTextAtSize('SMS · CBT · SITE GUIDE', 8.2), H - 38, 8.2, fonts.body, palette.muted)
  page.drawRectangle({ x: M, y: H - 54, width: WIDTH, height: 3, color: palette.lime })
  y = H - 92
  if (continued) {
    for (const line of wrap(`${currentTitle} — continued`, WIDTH, 13, fonts.bold)) {
      drawLine(line, M, y, 13, palette.green)
      y -= 20
    }
    y -= 12
  }
}

function ensure(height) {
  if (y - height < BOTTOM) newBodyPage(true)
}

function paragraph(value, { indent = 0, marker = '', size = bodySize, font, gap = 9, color = palette.ink } = {}) {
  const lines = wrap(value, WIDTH - indent, size, font)
  const leading = Math.max(lineHeight, size * 1.4)
  ensure(Math.min(lines.length, 2) * leading)
  if (marker) text(marker, M, y, size, fonts.body, palette.green)
  for (const line of lines) {
    ensure(leading)
    drawLine(line, M + indent, y, size, color)
    y -= leading
  }
  y -= gap
}

// Cover.
page = pdf.addPage([W, H])
page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: palette.paper })
page.drawRectangle({ x: M, y: H - 75, width: 44, height: 6, color: palette.lime })
text('EZIO NIGERIA', M, H - 111, 16, fonts.bold, palette.green)
text('Site navigation', M, 639, 34, fonts.bold)
text('& workflow guide', M, 592, 34, fonts.bold)
text('School management first. CBT inside SMS.', M, 547, 14, fonts.body, palette.green)
y = 500
paragraph('A practical reference for Super Admin, School Admin, teachers, students and exam-hall invigilators.', { size: 12 })

const flow = ['Sign in', 'School dashboard', 'Choose a module']
const cardWidth = (WIDTH - 30) / 3
flow.forEach((label, index) => {
  const x = M + index * (cardWidth + 15)
  page.drawRectangle({ x, y: 365, width: cardWidth, height: 70, color: rgb(1, 1, 1), borderColor: palette.rule, borderWidth: 1 })
  text(`0${index + 1}`, x + 12, 412, 9, fonts.bold, palette.green)
  text(label, x + 12, 389, 10.2, fonts.bold)
})
y = 315
paragraph('Open CBT in the sidebar for exam preparation, online attempts, hall servers and result imports. Return to School dashboard for school records and term reports.', { size: 11.5 })
text('Standalone PDF · Searchable text · Clickable contents', M, 134, 10, fonts.body, palette.muted)
text(`Updated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, M, 110, 10, fonts.body, palette.muted)

// Reserve a contents page so body page numbers remain stable.
currentTitle = 'Contents'
newBodyPage()
const contentsPage = page

for (const section of sections) {
  currentTitle = section.title
  newBodyPage()
  sectionPages.push({ title: section.title, page, number: pdf.getPageCount() })
  paragraph(section.title, { size: 22, font: fonts.bold, gap: 18, color: palette.green })
  let pending = []
  const flush = () => { if (pending.length) { paragraph(pending.join(' ')); pending = [] } }
  for (const raw of section.lines) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('### ')) {
      flush()
      ensure(70)
      y -= 7
      paragraph(line.slice(4), { size: 13, font: fonts.bold, gap: 8, color: palette.green })
    } else if (line.startsWith('- ')) {
      flush()
      paragraph(line.slice(2), { indent: 15, marker: '•', gap: 5 })
    } else if (/^\d+\. /.test(line)) {
      flush()
      const marker = line.match(/^\d+\./)[0]
      paragraph(line.slice(marker.length + 1), { indent: 23, marker, gap: 6 })
    } else {
      pending.push(line)
    }
  }
  flush()
}

page = contentsPage
y = H - 92
paragraph('Contents', { size: 24, font: fonts.bold, gap: 20, color: palette.green })
paragraph('Select a section to jump to it. Start with sections 1–2 for navigation, then use the workflow for your role.', { gap: 20 })
const annotations = []
for (const section of sectionPages) {
  const titleLines = wrap(section.title, WIDTH - 38, 10.7, fonts.bold)
  const top = y + 13
  for (const line of titleLines) { drawLine(line, M, y, 10.7); y -= 17 }
  const number = String(section.number)
  text(number, W - M - fonts.body.widthOfTextAtSize(number, 10.7), top - 13, 10.7, fonts.body, palette.green)
  annotations.push(pdf.context.register(pdf.context.obj({
    Type: 'Annot', Subtype: 'Link', Rect: [M, y, W - M, top], Border: [0, 0, 0],
    Dest: [section.page.ref, PDFName.of('FitH'), H],
  })))
  y -= 14
}
assert(y >= BOTTOM, 'Contents overflowed; split it before adding more sections.')
contentsPage.node.set(PDFName.of('Annots'), pdf.context.obj(annotations))

const pages = pdf.getPages()
pages.forEach((target, index) => {
  target.drawLine({ start: { x: M, y: 47 }, end: { x: W - M, y: 47 }, thickness: 0.5, color: palette.rule })
  text('Ezio Nigeria · Site guide', M, 30, 8, fonts.body, palette.muted, target)
  const number = `${index + 1} / ${pages.length}`
  text(number, W - M - fonts.body.widthOfTextAtSize(number, 8), 30, 8, fonts.body, palette.muted, target)
})

const bytes = await pdf.save()
const verification = await PDFDocument.load(bytes)
assert.equal(verification.getPageCount(), pages.length)
assert.equal(annotations.length, sections.length)
const output = new URL('docs/Ezio-Site-Guide.pdf', root)
await writeFile(output, bytes)
console.log(`Created ${fileURLToPath(output)} (${pages.length} pages, ${sections.length} linked sections, ${Math.round(bytes.length / 1024)} KB).`)
for (const section of sectionPages) console.log(`Page ${section.number}: ${section.title}`)
