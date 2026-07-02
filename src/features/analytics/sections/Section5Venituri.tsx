import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getMixMetode, getMixCategoriiIncasari, type Interval } from '@/features/statistici/api'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import { CategorieChart } from '@/features/statistici/CategorieChart'
import { MetodePlataChart } from '@/features/statistici/MetodePlataChart'
import { getArpuTrend, getMixRecurentOneoff } from '../api'
import { ArpuTrendChart } from '../ArpuTrendChart'
import { ANALYTICS_QO, SectionTitle } from './shared'

const CATEG_INCASARI_PALETTE: Record<string, string> = {
  Abonament: '#10b981',
  Bilet: '#3b82f6',
  Merch: '#ffd600',
  Taxa: '#a855f7',
  Workshop: '#ec4899',
  Auditie: '#14b8a6',
  Necunoscut: '#9ca3af',
}

export function Section5Venituri({ interval, scope }: { interval: Interval; scope: string | null }) {
  const arpuQ = useQuery({ queryKey: ['an', 'arpu', interval, scope], queryFn: () => getArpuTrend(interval, scope), ...ANALYTICS_QO })
  const recurentQ = useQuery({ queryKey: ['an', 'recurent', interval, scope], queryFn: () => getMixRecurentOneoff(interval, scope), ...ANALYTICS_QO })
  const metodeQ = useQuery({ queryKey: ['an', 'metode', interval, scope], queryFn: () => getMixMetode(interval, scope), ...ANALYTICS_QO })
  const categIncQ = useQuery({ queryKey: ['an', 'categ-inc', interval, scope], queryFn: () => getMixCategoriiIncasari(interval, scope), ...ANALYTICS_QO })

  const recurentSlices = useMemo(() => {
    const rows = recurentQ.data ?? []
    const rec = rows.find((r) => r.tip === 'Recurent')?.total ?? 0
    const oneoff = rows.find((r) => r.tip === 'One-off')?.total ?? 0
    const tot = rec + oneoff
    return { rec, oneoff, pct: tot > 0 ? Math.round((100 * rec) / tot) : 0 }
  }, [recurentQ.data])

  return (
    <section>
      <SectionTitle sub="ARPU, mix recurent vs one-off, distribuție pe metode/categorii.">
        5 · Calitatea veniturilor
      </SectionTitle>
      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-quasar-black">
          Venit mediu per client (ARPU) pe lună
          <span className="ml-2 font-normal text-quasar-gray">— venit ÷ clienți activi</span>
        </h3>
        {arpuQ.isLoading ? <Spinner /> : <ArpuTrendChart rows={arpuQ.data ?? []} />}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {recurentQ.isLoading ? (
          <Spinner />
        ) : (
          <OverviewDonut
            title="Recurent vs one-off"
            percent={recurentSlices.pct}
            centerSub="recurent"
            slices={[
              { name: 'Recurent', value: recurentSlices.rec },
              { name: 'One-off', value: recurentSlices.oneoff },
            ]}
            colors={['#10b981', '#f59e0b']}
          />
        )}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Mix metode de plată</h3>
          {metodeQ.isLoading ? <Spinner /> : <MetodePlataChart rows={metodeQ.data ?? []} />}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Încasări pe categorie</h3>
          {categIncQ.isLoading ? (
            <Spinner />
          ) : (
            <CategorieChart title="Distribuție încasări" rows={categIncQ.data ?? []} palette={CATEG_INCASARI_PALETTE} />
          )}
        </div>
      </div>
    </section>
  )
}
