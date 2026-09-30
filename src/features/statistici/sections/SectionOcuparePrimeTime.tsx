import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getOcuparePrimeTime } from '../api'
import { OcuparePrimeTimeChart } from '../OcuparePrimeTimeChart'
import { STAT_QO } from './shared'

export function SectionOcuparePrimeTime() {
  const { locatieId } = useWorkingLocatie()

  const primeTimeQ = useQuery({
    queryKey: ['stat', 'prime-time', locatieId],
    queryFn: () => getOcuparePrimeTime(locatieId),
    ...STAT_QO,
  })

  return (
    <section>
      {primeTimeQ.isLoading ? (
        <Spinner />
      ) : (
        <OcuparePrimeTimeChart rows={primeTimeQ.data ?? []} />
      )}
    </section>
  )
}
