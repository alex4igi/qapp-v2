import type { Enums } from '@/types/db'

export type ZiSaptamana = Enums<'zi_saptamana'>

const DOW_RO: ZiSaptamana[] = [
  'Duminica',
  'Luni',
  'Marti',
  'Miercuri',
  'Joi',
  'Vineri',
  'Sambata',
]

export function dayOfWeekRO(date: Date): ZiSaptamana {
  return DOW_RO[date.getDay()]
}

export function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

export function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}
