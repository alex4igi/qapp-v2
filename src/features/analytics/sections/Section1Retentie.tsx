import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { getRetentieLuna } from '@/features/statistici/api'
import { getCrestereNeta } from '@/features/ansamblu/api'
import { KpiCard } from '@/features/statistici/KpiCard'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import { TotalClientiChart } from '@/features/ansamblu/TotalClientiChart'
import { getRetentieCohorte, getDurataMedieLtv } from '../api'
import { RetentieCohorteTable } from '../RetentieCohorteTable'
import { FluxChart } from '../MiniCharts'
import { ANALYTICS_QO, SectionTitle } from './shared'

export function Section1Retentie({ scope }: { scope: string | null }) {
  const crestereQ = useQuery({ queryKey: ['an', 'crestere', scope], queryFn: () => getCrestereNeta(scope, 12), ...ANALYTICS_QO })
  const retentieQ = useQuery({ queryKey: ['an', 'retentie'], queryFn: getRetentieLuna, ...ANALYTICS_QO })
  const cohorteQ = useQuery({ queryKey: ['an', 'cohorte'], queryFn: () => getRetentieCohorte(null), ...ANALYTICS_QO })
  const ltvQ = useQuery({ queryKey: ['an', 'ltv', scope], queryFn: () => getDurataMedieLtv(scope), ...ANALYTICS_QO })

  const crestereUltima = crestereQ.data?.[crestereQ.data.length - 1]

  return (
    <section>
      <SectionTitle sub="Fluxurile contează, nu stocul: 300 cursanți nu spun nimic dacă pierzi 30 și înlocuiești 30.">
        1 · Retenție & Churn
      </SectionTitle>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Intrați (luna trecută)" value={crestereUltima?.intrati ?? '—'} tone="positive" />
        <KpiCard label="Pierduți (luna trecută)" value={crestereUltima?.pierduti ?? '—'} tone="negative" />
        <KpiCard
          label="Net"
          value={crestereUltima ? (crestereUltima.net > 0 ? `+${crestereUltima.net}` : crestereUltima.net) : '—'}
          tone={crestereUltima && crestereUltima.net < 0 ? 'negative' : 'positive'}
        />
        <KpiCard
          label="Durată medie înscriere"
          value={ltvQ.data?.durata_medie_luni != null ? `${ltvQ.data.durata_medie_luni} luni` : '—'}
          hint={ltvQ.data?.ltv_mediu != null ? `LTV ~${formatRON(ltvQ.data.ltv_mediu)}` : undefined}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Intrări vs abandonuri (12 luni)</h3>
          {crestereQ.isLoading ? <Spinner /> : <FluxChart rows={crestereQ.data ?? []} />}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Total clienți (12 luni)</h3>
          {crestereQ.isLoading ? <Spinner /> : <TotalClientiChart rows={crestereQ.data ?? []} />}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {retentieQ.isLoading ? (
            <Spinner />
          ) : (
            <OverviewDonut
              title="Retenție membri (lună-vs-lună)"
              percent={retentieQ.data?.rata ?? 0}
              centerSub="reținuți"
              slices={[
                { name: 'Reținuți', value: retentieQ.data?.retinuti ?? 0 },
                { name: 'Pierduți', value: retentieQ.data?.pierduti ?? 0 },
              ]}
              colors={['#16a34a', '#ef4444']}
            />
          )}
        </div>
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">
            Retenție pe luna înscrierii
            <span className="ml-2 font-normal text-quasar-gray">— câți rămân, lună de lună</span>
          </h3>
          {cohorteQ.isLoading ? <Spinner /> : <RetentieCohorteTable rows={cohorteQ.data ?? []} />}
        </div>
      </div>
    </section>
  )
}
