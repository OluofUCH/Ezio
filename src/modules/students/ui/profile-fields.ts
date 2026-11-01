import type { Field } from '@/src/modules/workspace/ui/common'

export function studentProfileFields(profile?: Record<string, string | null> | null, clearable = false): Field[] {
  return [
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date', value: profile?.dateOfBirth?.slice(0, 10), clearable },
    { name: 'gender', label: 'Gender', value: profile?.gender, clearable },
    { name: 'address', label: 'Address', type: 'textarea', value: profile?.address, clearable },
    { name: 'guardianName', label: 'Guardian name', value: profile?.guardianName, clearable },
    { name: 'guardianRelationship', label: 'Relationship', value: profile?.guardianRelationship, clearable },
    { name: 'guardianPhone', label: 'Guardian phone', type: 'tel', value: profile?.guardianPhone, clearable },
    { name: 'guardianEmail', label: 'Guardian email', type: 'email', value: profile?.guardianEmail, clearable },
  ]
}
