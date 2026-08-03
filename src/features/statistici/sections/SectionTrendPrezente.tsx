import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getTrendPrezente } from '@/features/ansamblu/api'
import { TrendPrezenteSection } from '@/features/ansamblu/TrendPrezenteSection'
import { STAT_QO } from './shared'

export function SectionTrendPrezente() {
  const { locatieId: scopLocatie } = useWorkingLocatie()

  const trendQ = useQuery({
    queryKey: ['stat', 'trend', scopLocatie],
    queryFn: () => getTrendPrezente(scopLocatie),
    ...STAT_QO,
  })

  return trendQ.isLoading ? (
    <Spinner />
  ) : (
    <TrendPrezenteSection rows={trendQ.data ?? []} />
  )
}
