import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import { getDatoriiDashboard, restLuna, sumDatorii } from '../api'
import { DATORII_QO, LUNA_CURENTA_LABEL } from './shared'

// Gradul de încasare al LUNII CURENTE (oglinda ratei de restanțe din KPI) —
// nu cel cumulat pe ani, care nu mai spune nimic despre ce se poate face acum.
export function SectionColectareDonut({ locatieId }: { locatieId: string | null }) {
  const dashQ = useQuery({
    queryKey: ['datorii', 'dashboard', locatieId],
    queryFn: () => getDatoriiDashboard(locatieId),
    ...DATORII_QO,
  })

  if (dashQ.isLoading) return <Spinner />
  if (dashQ.isError)
    return <p className="text-sm text-red-600">Eroare: {humanizeError(dashQ.error)}</p>

  const total = sumDatorii(dashQ.data ?? [])
  const rest = restLuna(total)
  const incasat = Math.max(total.de_incasat_luna - rest, 0)
  const percent = total.de_incasat_luna > 0 ? Math.round((incasat / total.de_incasat_luna) * 100) : 0

  return (
    <OverviewDonut
      title={`Grad de încasare · ${LUNA_CURENTA_LABEL}`}
      percent={percent}
      centerSub="din facturat luna asta"
      slices={[
        { name: 'Încasat', value: Math.round(incasat) },
        { name: 'Restant', value: Math.round(rest) },
      ]}
      colors={['#10b981', '#ef4444']}
      emptyMessage="Nimic facturat luna aceasta în scopul selectat."
    >
      <p className="mt-1 text-center text-xs text-quasar-gray">
        Încasat {formatRON(incasat)} · restant{' '}
        <span className="font-medium text-red-600">{formatRON(rest)}</span>
        {total.recuperat_luna > 0 && (
          <>
            {' '}
            · plus{' '}
            <span className="font-medium text-emerald-600">
              {formatRON(total.recuperat_luna)}
            </span>{' '}
            recuperat din luni vechi
          </>
        )}
      </p>
    </OverviewDonut>
  )
}
