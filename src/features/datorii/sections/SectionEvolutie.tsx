import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { humanizeError } from '@/lib/errorMessage'
import { getDatoriiEvolutie } from '../api'
import { EvolutieChart } from './EvolutieChart'
import { DATORII_QO } from './shared'

export function SectionEvolutie({ locatieId }: { locatieId: string | null }) {
  const evolQ = useQuery({
    queryKey: ['datorii', 'evolutie', locatieId],
    queryFn: () => getDatoriiEvolutie(locatieId, 12),
    ...DATORII_QO,
  })

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-quasar-black">Evoluția soldului restant</h3>
      <p className="mb-3 text-xs text-quasar-gray">
        sold la finalul fiecărei luni (balanță facturat − încasat) — scade sau crește datoria?
      </p>
      {evolQ.isLoading ? (
        <Spinner />
      ) : evolQ.isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(evolQ.error)}</p>
      ) : (
        <EvolutieChart rows={evolQ.data ?? []} />
      )}
    </div>
  )
}
