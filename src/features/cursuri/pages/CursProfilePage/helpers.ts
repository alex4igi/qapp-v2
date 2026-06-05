import type { SelectOption } from '@/components/ui'

const RO_MONTHS = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

export function formatData(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${RO_MONTHS[m - 1]} ${y}`
}

export function getCursInitials(nume: string): string {
  const parts = nume.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return nume.slice(0, 2).toUpperCase() || '?'
}

export function fullName(nume: string, prenume: string | null): string {
  return `${nume} ${prenume ?? ''}`.trim()
}

export function labelOf(
  options: SelectOption[] | undefined,
  id: string | null,
): string {
  if (!id) return ''
  return options?.find((o) => o.value === id)?.label ?? ''
}
