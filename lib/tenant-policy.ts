import { ApiError } from './errors'

type Args = Record<string, unknown>
export type TenantModelPolicy = {
  direct: ReadonlySet<string>
  relations: ReadonlyMap<string, ReadonlySet<string>>
}

const relationPaths: Record<string, (schoolId: string) => Args> = {
  Question: (schoolId) => ({ exam: { schoolId } }),
  Option: (schoolId) => ({ question: { exam: { schoolId } } }),
  ExamSession: (schoolId) => ({ exam: { schoolId } }),
  Answer: (schoolId) => ({ examSession: { exam: { schoolId } } }),
}
const filterable = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
  'updateMany', 'updateManyAndReturn', 'deleteMany',
])
const unique = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert'])
const creates = new Set(['create', 'createMany', 'createManyAndReturn'])

function unsafe(message: string): never {
  throw new ApiError(500, 'CONFIGURATION_ERROR', `Tenant safety: ${message}`)
}

function record(value: unknown): Args {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    unsafe('expected a record of query arguments.')
  }
  return value as Args
}

/** Shared by real Prisma queries and focused isolation tests. Mutates only args. */
export function scopeTenantArgs(
  schoolId: string,
  model: string | undefined,
  operation: string,
  args: Args,
  policy: TenantModelPolicy,
): void {
  if (!schoolId.trim()) unsafe('a verified schoolId is required.')
  if (!model) unsafe('raw queries are not available on a tenant client.')
  const direct = policy.direct.has(model)
  const path = relationPaths[model]
  const school = model === 'School'
  if (!direct && !path && !school) unsafe(`${model} has no registered tenant boundary.`)
  if (!filterable.has(operation) && !unique.has(operation) && !creates.has(operation)) {
    unsafe(`${model}.${operation} is not a supported scoped operation.`)
  }

  const scope = direct ? { schoolId } : school ? { id: schoolId } : path!(schoolId)
  if (filterable.has(operation)) {
    args.where = args.where ? { AND: [args.where, scope] } : scope
  } else if (unique.has(operation)) {
    if (direct || school) {
      args.where = { ...(args.where ? record(args.where) : {}), ...scope }
    } else if (model !== 'Answer') {
      // Existing CBT Answer upserts use a caller-resolved session/question key.
      // All new tenant models carry schoolId and do not use this legacy exception.
      unsafe(`${model}.${operation} requires findFirst or a scoped *Many write plus assertAffected().`)
    }
  }

  if (school && (creates.has(operation) || operation === 'upsert')) {
    unsafe('tenant provisioning requires the platform administrator client.')
  }

  function write(value: unknown, creating: boolean): Args {
    const data = record(value)
    if (direct || school) {
      for (const key of policy.relations.get(model!) ?? []) {
        if (key in data) unsafe(`${model}.${key} nested writes require a separately scoped service.`)
      }
      const tenantKey = school ? 'id' : 'schoolId'
      if (!creating && tenantKey in data) unsafe(`${model}.${tenantKey} is immutable.`)
    }
    return creating && direct ? { ...data, schoolId } : data
  }

  if (creates.has(operation)) {
    args.data = Array.isArray(args.data)
      ? args.data.map((row) => write(row, true))
      : write(args.data, true)
  } else if (operation === 'upsert') {
    args.create = write(args.create, true)
    args.update = write(args.update, false)
  } else if (operation.startsWith('update')) {
    args.data = write(args.data, false)
  }
}
