import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getTrendPrezente } from '@/features/ansamblu/api'
import { TrendPrezenteSection } from '@/features/ansamblu/TrendPrezenteSection'
import { getAbsenteConsecutive, getRestanteAging } from '../api'
import { AbsenteConsecutiveTable } from '../AbsenteConsecutiveTable'
import { RestanteAgingChart } from '../RestanteAgingChart'
import { ANALYTICS_QO, SectionTitle } from './shared'

export function Section3Risc({ scope }: { scope: string | null }) {
  const absenteQ = useQuery({ queryKey: ['an', 'absente', scope], queryFn: () => getAbsenteConsecutive(scope, 2), ...ANALYTICS_QO })
  const agingQ = useQuery({ queryKey: ['an', 'aging', scope], queryFn: () => getRestanteAging(scope), ...ANALYTICS_QO })
  const trendQ = useQuery({ queryKey: ['an', 'trend', scope], queryFn: () => getTrendPrezente(scope), ...ANALYTICS_QO })

  return (
    <section>
      <SectionTitle sub="Intervenție înainte să plece — aici un dashboard în timp real își merită banii.">
        3 · Semnale de risc timpuriu
      </SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Cursanți cu absențe consecutive</h3>
          {absenteQ.isLoading ? <Spinner /> : <AbsenteConsecutiveTable rows={absenteQ.data ?? []} />}
        </div>
        <div>{agingQ.isLoading ? <Spinner /> : <RestanteAgingChart rows={agingQ.data ?? []} />}</div>
      </div>
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-quasar-black">Trend prezență per grupă (grupe în scădere)</h3>
        {trendQ.isLoading ? <Spinner /> : <TrendPrezenteSection rows={trendQ.data ?? []} />}
      </div>
    </section>
  )
}
