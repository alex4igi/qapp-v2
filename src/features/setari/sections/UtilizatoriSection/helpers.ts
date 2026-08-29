import type { UserRole } from '../../utilizatoriApi'

export { formatDateTime as formatDate } from '@/lib/format'

export const ALL_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'owner',      label: 'Owner' },
  { value: 'admin',      label: 'Admin' },
  { value: 'manager',    label: 'Manager' },
  { value: 'teacher',    label: 'Instructor' },
  { value: 'front_desk', label: 'Front Desk' },
  { value: 'marketing',  label: 'Marketing (agenție)' },
]
