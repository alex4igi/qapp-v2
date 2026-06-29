import type { SimpleTip } from '../../SimpleIncasareForm'

export type TipPlata = 'Abonament' | 'Open' | 'Datorii' | SimpleTip

export const tipTabs: { id: TipPlata; label: string }[] = [
  { id: 'Abonament', label: 'Abonament' },
  { id: 'Open',      label: 'Open class' },
  { id: 'Bilet',     label: 'Bilet' },
  { id: 'Merch',     label: 'Merch' },
  { id: 'Taxa',      label: 'Taxă' },
  { id: 'Datorii',   label: 'Datorii' },
]

export function todayIso(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, day] = iso.split('-')
  const months = [
    'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
    'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
  ]
  return `${Number(day)} ${months[Number(m) - 1]} ${y}`
}
