import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { getRestanteAging } from '@/features/analytics/api'
import { RestanteAgingChart } from '@/features/analytics/RestanteAgingChart'
import { DATORII_QO } from './shared'

export function SectionAging({ locatieId }: { locatieId: string | null }) {
  const agingQ = useQuery({
    queryKey: ['datorii', 'aging', locatieId],
    queryFn: () => getRestanteAging(locatieId),
    ...DATORII_QO,
  })

  if (agingQ.isLoading) return <Spinner />
  if (agingQ.isError)
    return <p className="text-sm text-red-600">Eroare: {humanizeError(agingQ.error)}</p>

  return <RestanteAgingChart rows={agingQ.data ?? []} />
}
