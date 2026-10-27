import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { unscopedDb } from '@/lib/db'
import { conflict } from '@/lib/errors'
import { requireSuperAdmin } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'
import { pageMeta, paginate } from '@/lib/validation/common'
import { createSchoolSchema, listSchoolsSchema } from '@/lib/validation/school'

export const runtime = 'nodejs'

/**
 * Schools — SUPER_ADMIN only (PRD §2).
 *
 * The second legitimate `unscopedDb` call site: the platform owner manages every
 * tenant, so a per-school scope would be meaningless here. The gate is
 * `requireSuperAdmin`, not a query filter.
 */

/** GET /api/schools — list every tenant. */
export const GET = route(async (req) => {
  await requireSuperAdmin(req)

  const query = readQuery(req, listSchoolsSchema)

  const where = {
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { slug: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [schools, total] = await Promise.all([
    unscopedDb.school.findMany({
      where,
      ...paginate(query),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        address: true,
        logoUrl: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: true, students: true, exams: true, localServers: true } },
      },
    }),
    unscopedDb.school.count({ where }),
  ])

  return ok({ schools, meta: pageMeta(total, query) })
})

/**
 * POST /api/schools — onboard a tenant, optionally with its first School Admin.
 *
 * Both records are created in one transaction. A school with no administrator is a
 * tenant nobody can log into (PRD §3.1 expects the admin to add teachers and
 * students next), and a half-completed onboarding would need manual repair.
 */
export const POST = route(async (req) => {
  await requireSuperAdmin(req)

  const input = await readJson(req, createSchoolSchema)

  // Checked up front for a clear message. The unique indexes are still the real
  // guarantee — two concurrent requests would race past these reads, and the
  // constraint violation is mapped to a 409 by `lib/api.ts`.
  const [slugTaken, emailTaken] = await Promise.all([
    unscopedDb.school.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    input.admin
      ? unscopedDb.user.findUnique({ where: { email: input.admin.email }, select: { id: true } })
      : Promise.resolve(null),
  ])

  if (slugTaken) {
    throw conflict(`The slug "${input.slug}" is already in use by another school.`, 'ALREADY_EXISTS')
  }
  if (emailTaken) {
    throw conflict(`A user with the email ${input.admin?.email} already exists.`, 'ALREADY_EXISTS')
  }

  // Hashed outside the transaction: bcrypt at cost 12 takes ~200ms, and holding a
  // database transaction open for that long for no reason wastes a pooled connection.
  const passwordHash = input.admin ? await hashPassword(input.admin.password) : null

  const school = await unscopedDb.$transaction(async (tx) => {
    const createdSchool = await tx.school.create({
      data: {
        name: input.name,
        slug: input.slug,
        address: input.address ?? null,
        logoUrl: input.logoUrl ?? null,
      },
      select: { id: true, name: true, slug: true, address: true, logoUrl: true, isActive: true, createdAt: true },
    })

    let admin = null
    if (input.admin && passwordHash) {
      admin = await tx.user.create({
        data: {
          schoolId: createdSchool.id,
          email: input.admin.email,
          passwordHash,
          fullName: input.admin.fullName,
          role: 'SCHOOL_ADMIN',
        },
        select: { id: true, email: true, fullName: true, role: true },
      })
    }

    return { ...createdSchool, admin }
  })

  return created({ school })
})
