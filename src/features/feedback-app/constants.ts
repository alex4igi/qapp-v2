import type { SelectOption } from '@/components/ui'
import type { AppFeedbackStatus, AppFeedbackSursa, AppFeedbackTip } from '@/types/db'

// Opțiuni pentru Select (value = enum DB fără diacritice; label = afișaj cu emoji/diacritice).
export const tipOptions: SelectOption[] = [
  { label: '🐞 Bug — ceva nu funcționează', value: 'Bug' },
  { label: '💡 Idee — sugestie / îmbunătățire', value: 'Idee' },
  { label: '❓ Întrebare', value: 'Intrebare' },
]

export const statusOptions: SelectOption[] = [
  { label: 'Nou', value: 'Nou' },
  { label: 'În lucru', value: 'In lucru' },
  { label: 'Planificat', value: 'Planificat' },
  { label: 'Rezolvat', value: 'Rezolvat' },
  { label: 'Respins', value: 'Respins' },
]

export const TIP_LABEL: Record<AppFeedbackTip, string> = {
  Bug: '🐞 Bug',
  Idee: '💡 Idee',
  Intrebare: '❓ Întrebare',
}

export const sursaOptions: SelectOption[] = [
  { label: '🏢 Din aplicație (staff)', value: 'staff' },
  { label: '👤 Din portal (membru)', value: 'portal' },
]

export const SURSA_LABEL: Record<AppFeedbackSursa, string> = {
  staff: '🏢 Staff',
  portal: '👤 Membru',
}

export const SURSA_BADGE: Record<AppFeedbackSursa, string> = {
  staff: 'bg-quasar-gray-light text-quasar-gray',
  portal: 'bg-amber-100 text-amber-800',
}

export const STATUS_LABEL: Record<AppFeedbackStatus, string> = {
  Nou: 'Nou',
  'In lucru': 'În lucru',
  Planificat: 'Planificat',
  Rezolvat: 'Rezolvat',
  Respins: 'Respins',
}

// Clase Tailwind pentru badge-ul de status (badge text-only, pastilă).
export const STATUS_BADGE: Record<AppFeedbackStatus, string> = {
  Nou: 'bg-blue-100 text-blue-800',
  'In lucru': 'bg-amber-100 text-amber-800',
  Planificat: 'bg-purple-100 text-purple-800',
  Rezolvat: 'bg-green-100 text-green-800',
  Respins: 'bg-quasar-gray-light text-quasar-gray',
}
