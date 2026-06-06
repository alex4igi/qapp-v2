import type { SelectOption } from '@/components/ui'
import { ROLE_LABEL } from '@/lib/rolesMatrix'

// Rolurile legate de locație, selectabile ca destinatari (escaladarea la admin/owner
// se face separat printr-un checkbox).
export const LOC_ROLE_OPTIONS: SelectOption[] = [
  { value: 'teacher', label: ROLE_LABEL.teacher },
  { value: 'front_desk', label: ROLE_LABEL.front_desk },
  { value: 'manager', label: ROLE_LABEL.manager },
]
