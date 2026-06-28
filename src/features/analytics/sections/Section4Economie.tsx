import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getGradOcupare } from '@/features/ansamblu/api'
import { OcupareList } from '@/features/ansamblu/OcupareList'
import { getOcuparePrimeTime, getRentabilitateGrupa } from '../api'
import { OcuparePrimeTimeChart } from '../OcuparePrimeTimeChart'
import { RentabilitateGrupaTable } from '../RentabilitateGrupaTable'
import { ANALYTICS_QO, SectionTitle } from './shared'

export function Section4Economie({ scope }: { scope: string | null }) {
  const ocupareQ = useQuery({ queryKey: ['an', 'ocupare', scope], queryFn: () => getGradOcupare(scope), ...ANALYTICS_QO })
  const primeTimeQ = useQuery({ queryKey: ['an', 'prime-time', scope], queryFn: () => getOcuparePrimeTime(scope), ...ANALYTICS_QO })
  const rentabQ = useQuery({ queryKey: ['an', 'rentab-grupa'], queryFn: () => getRentabilitateGrupa(12), ...ANALYTICS_QO })

  return (
    <section>
      <SectionTitle sub="Dincolo de ocuparea brută: prag de rentabilitate și vârf de oră.">
        4 · Economia grupelor
      </SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Grad de ocupare</h3>
          {ocupareQ.isLoading ? <Spinner /> : <OcupareList rows={ocupareQ.data ?? []} />}
        </div>
        <div>{primeTimeQ.isLoading ? <Spinner /> : <OcuparePrimeTimeChart rows={primeTimeQ.data ?? []} />}</div>
      </div>
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-quasar-black">Rentabilitate per grupă</h3>
        {rentabQ.isLoading ? <Spinner /> : <RentabilitateGrupaTable rows={rentabQ.data ?? []} />}
      </div>
    </section>
  )
}
