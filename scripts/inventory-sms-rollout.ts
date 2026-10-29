import { unscopedDb } from '../lib/db'

async function main() {
  const schools = await unscopedDb.school.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true, isActive: true },
  })
  const [students, exams] = await Promise.all([
    unscopedDb.student.groupBy({ by: ['schoolId', 'classLevel'], _count: { _all: true } }),
    unscopedDb.exam.findMany({ select: { schoolId: true, subject: true } }),
  ])
  const report = schools.map((school) => ({
    ...school,
    studentsByLevel: Object.fromEntries(
      students.filter((row) => row.schoolId === school.id).map((row) => [row.classLevel, row._count._all]),
    ),
    existingExamSubjects: [...new Set(
      exams.filter((exam) => exam.schoolId === school.id).map((exam) => exam.subject.trim()).filter(Boolean),
    )].sort((a, b) => a.localeCompare(b)),
  }))
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), schools: report }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(() => unscopedDb.$disconnect())
