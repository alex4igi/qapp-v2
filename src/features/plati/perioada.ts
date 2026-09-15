import type { SelectOption } from '@/components/ui'

export type Perioada = 'azi' | 'ieri' | 'luna' | 'luna_trecuta' | 'interval' | 'tot'

export const PERIOADE: SelectOption[] = [
  { value: 'azi', label: 'Azi' },
  { value: 'ieri', label: 'Ieri' },
  { value: 'luna', label: 'Luna asta' },
  { value: 'luna_trecuta', label: 'Luna trecută' },
  { value: 'interval', label: 'Interval' },
  { value: 'tot', label: 'Tot' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const isoUtc = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

// Calcule pe ISO în UTC: `azi` vine deja corectat pe fusul României (todayIso),
// deci nu mai trecem prin ora locală a browserului.
function lunaDe(azi: string, deltaLuni: number): { from: string; to: string } {
  const [y, m] = azi.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1 + deltaLuni, 1))
  const end = new Date(Date.UTC(y, m + deltaLuni, 0))
  return { from: isoUtc(start), to: isoUtc(end) }
}

export function intervalPerioada(
  perioada: Perioada,
  azi: string,
  interval: { from: string; to: string },
): { from: string; to: string } {
  switch (perioada) {
    case 'azi':
      return { from: azi, to: azi }
    case 'ieri': {
      const [y, m, d] = azi.split('-').map(Number)
      const ieri = isoUtc(new Date(Date.UTC(y, m - 1, d - 1)))
      return { from: ieri, to: ieri }
    }
    case 'luna':
      return lunaDe(azi, 0)
    case 'luna_trecuta':
      return lunaDe(azi, -1)
    case 'interval':
      return interval
    case 'tot':
      return { from: '', to: '' }
  }
}
