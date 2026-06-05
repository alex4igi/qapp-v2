import type { UserRole } from '../../utilizatoriApi'

export const ALL_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'owner',      label: 'Owner' },
  { value: 'admin',      label: 'Admin' },
  { value: 'manager',    label: 'Manager' },
  { value: 'teacher',    label: 'Instructor' },
  { value: 'front_desk', label: 'Front Desk' },
]

export function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('ro-RO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
