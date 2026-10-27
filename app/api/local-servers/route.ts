import { created, ok, readJson, readQuery, route } from '@/lib/api'
import { forbidden } from '@/lib/errors'
import { canManageSchool, requireSchoolScope } from '@/lib/auth/session'
import { generateSetupCode } from '@/lib/auth/setup-code'
import { audit } from '@/lib/audit'
import { clientIp } from '@/lib/http/ip'
import { pageMeta, paginate } from '@/lib/validation/common'
import { createLocalServerSchema, listLocalServersSchema } from '@/lib/validation/local-server'

export const runtime = 'nodejs'

/**
 * Local servers - provisioning the offline halls (PRD A4.3).
 *
 * `deviceKey` is absent from this select and from every other read in the codebase.
 * It holds a SHA-256 digest that would be useless to a client anyway, but leaving it
 * out means a future `select: { ...LOCAL_SERVER_SELECT }` cannot accidentally start
 * returning credential material.
 */
const LOCAL_SERVER_SELECT = {
  id: true,
  name: true,
  deviceKeyPrefix: true,
  lastSyncedAt: true,
  lastSeenIp: true,
  isActive: true,
  createdAt: true,
  pairedAt: true,
  appVersion: true,
  _count: { select: { examSessions: true } },
} as const

function withPaired<T extends { pairedAt: Date | null; deviceKeyPrefix: string }>(server: T) {
  return { ...server, isPaired: Boolean(server.pairedAt || server.deviceKeyPrefix) }
}

/** GET /api/local-servers - halls provisioned for the caller's school. */
export const GET = route(async (req) => {
  const { db, session } = await requireSchoolScope(req)

  // PRD A2: the School Admin "manages their school: teachers, students, local servers".
  // A teacher runs exams on a hall server but does not provision or inspect them.
  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school admin can manage local servers.')
  }

  const query = readQuery(req, listLocalServersSchema)

  const where = {
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
  }

  const [localServers, total] = await Promise.all([
    db.localServer.findMany({
      where,
      ...paginate(query),
      orderBy: { createdAt: 'desc' },
      select: LOCAL_SERVER_SELECT,
    }),
    db.localServer.count({ where }),
  ])

  return ok({ localServers: localServers.map(withPaired), meta: pageMeta(total, query) })
})

/**
 * POST /api/local-servers - create an unpaired hall and issue a setup code.
 *
 * The plaintext code appears in this response and nowhere else. The long-lived
 * device key is minted only when the hall app claims the code, so the school admin
 * never has to paste a 48-character secret into a config file.
 */
export const POST = route(async (req) => {
  const { db, session, schoolId } = await requireSchoolScope(req)

  if (!canManageSchool(session.role)) {
    throw forbidden('Only a school admin can provision a local server.')
  }

  const input = await readJson(req, createLocalServerSchema)
  const setup = generateSetupCode()

  const localServer = await db.localServer.create({
    data: {
      name: input.name,
      setupCodeHash: setup.hash,
      setupCodeExpiresAt: setup.expiresAt,
      // schoolId is injected by the tenant extension (LocalServer is a DIRECT_MODEL in
      // lib/tenant.ts), so a device cannot be provisioned into another school.
    } as never,
    select: LOCAL_SERVER_SELECT,
  })

  await audit({
    schoolId,
    actorUserId: session.userId,
    actorType: 'STAFF',
    action: 'LOCAL_SERVER_CREATED',
    targetType: 'LocalServer',
    targetId: localServer.id,
    ip: clientIp(req),
  })

  return created({
    localServer: withPaired(localServer),
    setupCode: {
      value: setup.plaintext,
      expiresAt: setup.expiresAt.toISOString(),
      warning:
        'Enter this code in the hall app within 30 minutes. It works once. If it expires, generate a new code from this page.',
    },
    schoolId,
    nextSteps: {
      install: 'Install the CBT Hall Server app on the exam-hall PC, then open http://localhost:4000/setup.',
      pair: 'Enter the setup code shown above. The hall server exchanges it for its device key automatically.',
      stage: 'In the hall wizard, choose a published OFFLINE_LAN or HYBRID exam and download it before exam day.',
    },
  })
})
