import type { OccupKind } from './types'

// Fereastra de program a grilei (minute de la miezul nopții) + pasul de slot.
export const DAY_START_MIN = 8 * 60 // 08:00
export const DAY_END_MIN = 23 * 60 // 23:00
export const SLOT_MIN = 30

export const SLOTS_COUNT = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN

// Etichete scurte pentru capul de coloană (Luni…Duminica), indexate pe getDay()
// (Duminica=0). Săptămâna se afișează Luni→Duminica.
export const WEEKDAY_SHORT = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm']

// Culori pe tipul de ocupare (Tailwind classes).
export const OCCUP_STYLE: Record<OccupKind, string> = {
  curs: 'bg-quasar-gray-light/70 text-quasar-black border-quasar-gray-light',
  'inchiriere-platita': 'bg-quasar-yellow/40 text-quasar-black border-quasar-yellow',
  'inchiriere-gratis': 'bg-emerald-100 text-emerald-900 border-emerald-300',
}

export const OCCUP_LEGEND: { kind: OccupKind; label: string }[] = [
  { kind: 'curs', label: 'Curs recurent' },
  { kind: 'inchiriere-platita', label: 'Închiriere plătită' },
  { kind: 'inchiriere-gratis', label: 'Practică staff (gratis)' },
]
