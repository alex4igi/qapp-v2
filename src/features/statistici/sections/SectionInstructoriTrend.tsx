import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getInstructoriClientiTrend } from '../api'
import { InstructoriTrendCard } from '../InstructoriTrendCard'
import { STAT_QO } from './shared'

export function SectionInstructoriTrend() {
  const instructoriQ = useQuery({
    queryKey: ['stat', 'instructori-trend'],
    queryFn: () => getInstructoriClientiTrend(6),
    ...STAT_QO,
  })

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-quasar-black">
        Clienți per instructor — câștigă / pierde
      </h2>
      <p className="mb-3 text-xs text-quasar-gray">
        Tot clubul, ultimele 6 luni, luna curentă inclusă.
      </p>
      {instructoriQ.isLoading ? (
        <Spinner />
      ) : (
        <InstructoriTrendCard rows={instructoriQ.data ?? []} />
      )}
    </section>
  )
}
