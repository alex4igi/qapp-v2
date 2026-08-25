import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import { getDatoriiDashboard, sumDatorii } from '../api'
import { DATORII_QO } from './shared'

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
  const rest = total.rest_net + total.rest_oneoff
  const baza = total.incasat + rest
  const percent = baza > 0 ? Math.round((total.incasat / baza) * 100) : 0

  return (
    <OverviewDonut
      title="Grad de încasare"
      percent={percent}
      centerSub="din tot ce e facturabil"
      slices={[
        { name: 'Încasat', value: Math.round(total.incasat) },
        { name: 'Restant', value: Math.round(rest) },
      ]}
      colors={['#10b981', '#ef4444']}
      emptyMessage="Nimic facturabil în scopul selectat."
    >
      <p className="mt-1 text-center text-xs text-quasar-gray">
        Încasat {formatRON(total.incasat)} · restant{' '}
        <span className="font-medium text-red-600">{formatRON(rest)}</span>
      </p>
    </OverviewDonut>
  )
}
