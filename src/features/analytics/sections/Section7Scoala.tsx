import { useQuery } from '@tanstack/react-query'
import { Select, Spinner } from '@/components/ui'
import { getIncasariPerSezon } from '@/features/statistici/api'
import { KpiCard } from '@/features/statistici/KpiCard'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import { IncasariSezonChart } from '@/features/statistici/IncasariSezonChart'
import { getYoYAceeasiLuna, getCursantiMultiStil, getFamiliiFrati } from '../api'
import { YoYChart } from '../YoYChart'
import { ANALYTICS_QO, SectionTitle } from './shared'

type Props = {
  scope: string | null
  yoyMetrica: 'venit' | 'activi'
  setYoyMetrica: (m: 'venit' | 'activi') => void
  anCurent: number
}

export function Section7Scoala({ scope, yoyMetrica, setYoyMetrica, anCurent }: Props) {
  const yoyQ = useQuery({ queryKey: ['an', 'yoy', yoyMetrica, scope], queryFn: () => getYoYAceeasiLuna(yoyMetrica, scope), ...ANALYTICS_QO })
  const multiStilQ = useQuery({ queryKey: ['an', 'multi-stil'], queryFn: getCursantiMultiStil, ...ANALYTICS_QO })
  const fratiQ = useQuery({ queryKey: ['an', 'frati'], queryFn: getFamiliiFrati, ...ANALYTICS_QO })
  const incasariSezonQ = useQuery({ queryKey: ['an', 'incasari-sezon'], queryFn: getIncasariPerSezon, ...ANALYTICS_QO })

  return (
    <section>
      <SectionTitle sub="Comparații an-la-an (școală sezonieră), multi-stil și frați.">
        7 · Specific școală de dans
      </SectionTitle>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-quasar-black">An-la-an pe aceeași lună</h3>
        <div className="w-44">
          <Select
            value={yoyMetrica}
            onChange={(e) => setYoyMetrica(e.target.value as 'venit' | 'activi')}
            options={[
              { value: 'venit', label: 'Venit (RON)' },
              { value: 'activi', label: 'Clienți activi' },
            ]}
          />
        </div>
      </div>
      {yoyQ.isLoading ? <Spinner /> : <YoYChart rows={yoyQ.data ?? []} metrica={yoyMetrica} anCurent={anCurent} />}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {multiStilQ.isLoading ? (
          <Spinner />
        ) : (
          <OverviewDonut
            title="Cursanți în 2+ stiluri"
            percent={multiStilQ.data?.procent ?? 0}
            centerSub="din activi"
            slices={[
              { name: '2+ stiluri', value: multiStilQ.data?.multi_stil ?? 0 },
              { name: 'Un singur stil', value: (multiStilQ.data?.total_activi ?? 0) - (multiStilQ.data?.multi_stil ?? 0) },
            ]}
            colors={['#7c3aed', '#e5e5e5']}
          />
        )}
        <div className="grid grid-cols-1 gap-3 self-start">
          <KpiCard
            label="Familii cu frați înscriși"
            value={fratiQ.data?.familii_cu_frati ?? '—'}
            tone="positive"
            hint={fratiQ.data ? `din ${fratiQ.data.total_familii} familii active` : undefined}
          />
          <KpiCard
            label="Copii în familii cu frați"
            value={fratiQ.data?.copii_in_familii_frati ?? '—'}
            hint="cel mai mic churn"
          />
        </div>
        <div className="self-start">
          <KpiCard
            label="Cursanți multi-stil"
            value={multiStilQ.data?.multi_stil ?? '—'}
            hint={multiStilQ.data ? `din ${multiStilQ.data.total_activi} activi · cel mai mare LTV` : undefined}
          />
        </div>
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-quasar-black">Încasări pe sezon</h3>
        {incasariSezonQ.isLoading ? <Spinner /> : <IncasariSezonChart rows={incasariSezonQ.data ?? []} />}
      </div>
    </section>
  )
}
