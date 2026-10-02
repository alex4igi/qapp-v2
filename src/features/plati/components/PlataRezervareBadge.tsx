import { formatRON } from '@/lib/format'
import type { RezervareRow } from '../api/open-class'

export function PlataRezervareBadge({ r }: { r: Pick<RezervareRow, 'plata' | 'incasat' | 'rest'> }) {
  switch (r.plata) {
    case 'online':
      return <span className="ml-2 text-xs font-semibold text-amber-600">în așteptarea plății online</span>
    case 'neplatit':
      return <span className="ml-2 text-xs font-semibold text-red-600">neplătit · {formatRON(r.rest)}</span>
    case 'partial':
      return (
        <span className="ml-2 text-xs font-semibold text-amber-600">
          parțial · mai are {formatRON(r.rest)}
        </span>
      )
    case 'achitat':
      return null
  }
}
