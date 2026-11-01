export const DEFAULT_PARENT_PIN = '1234'

export type GuardianAccountResult = {
  status: 'created' | 'linked' | 'inactive' | 'incomplete'
  parentName?: string
  phone?: string
}

export function guardianAccountMessage(result?: GuardianAccountResult) {
  if (!result || result.status === 'incomplete') return 'Add a guardian name and phone number to the profile to create parent access automatically.'
  if (result.status === 'created') return `Parent account created for ${result.parentName} (${result.phone}). Initial parent PIN: ${DEFAULT_PARENT_PIN}.`
  if (result.status === 'inactive') return `Guardian details saved for ${result.parentName}. Parent access is inactive; review the account in Parent accounts.`
  return `Linked to the existing parent account for ${result.parentName} (${result.phone}). Its current PIN is unchanged.`
}
