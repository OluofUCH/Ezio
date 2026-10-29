export const SMS_CONTEXT_HEADER = 'x-sms-context'

/** Request precondition only. The server still derives authority from staff auth and its signed cookie. */
export function smsContextKey(userId: string, schoolId: string): string {
  return `${encodeURIComponent(userId)}:${encodeURIComponent(schoolId)}`
}
