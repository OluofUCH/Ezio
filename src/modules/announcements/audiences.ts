export const ANNOUNCEMENT_AUDIENCES = ['ALL_STAFF', 'ROLE', 'CLASS_ARM', 'ALL_PARENTS', 'PARENT_CLASS_ARM'] as const
export type AnnouncementAudience = typeof ANNOUNCEMENT_AUDIENCES[number]
export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  ALL_STAFF: 'All staff',
  ROLE: 'A staff role',
  CLASS_ARM: 'Staff assigned to a class arm',
  ALL_PARENTS: 'All parents',
  PARENT_CLASS_ARM: 'Parents of a class arm',
}
export const needsClassArm = (audience: string) => audience === 'CLASS_ARM' || audience === 'PARENT_CLASS_ARM'
