import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { getLeadFunnel, type Interval } from '@/features/statistici/api'
import { KpiCard } from '@/features/statistici/KpiCard'
import { FunnelLeadsChart } from '@/features/statistici/FunnelLeadsChart'
import type { ConversieLeadsRow } from '@/features/ansamblu/api'
import { getLeadsPeLuna } from '../api'
import { LeadsLunaChart } from '../MiniCharts'
import { ANALYTICS_QO, SectionTitle } from './shared'

type Props = {
  interval: Interval
  scope: string | null
  locatieId: string
  locatieLabel: string | null
  conversie?: ConversieLeadsRow
}

export function Section2Achizitie({ interval, scope, locatieId, locatieLabel, conversie }: Props) {
  const funnelQ = useQuery({
    queryKey: ['an', 'funnel', interval, locatieId],
    queryFn: () => getLeadFunnel(interval, scope, locatieLabel),
    ...ANALYTICS_QO,
  })
  const leadsLunaQ = useQuery({
    queryKey: ['an', 'leads-luna', interval, locatieLabel],
    queryFn: () => getLeadsPeLuna(interval, locatieLabel),
    ...ANALYTICS_QO,
  })

  return (
    <section>
      <SectionTitle sub="Ultimele 12 luni: pâlnia leadurilor și leadurile pe lună.">Leaduri</SectionTitle>
      {funnelQ.isLoading ? (
        <Spinner />
      ) : (
        <FunnelLeadsChart
          data={
            funnelQ.data ?? {
              global: { leads: 0, contactati: 0, proba: 0, prezenti: 0, convertiti: 0, retentieEligibili: 0, retentie90z: 0 },
              perSursa: [],
            }
          }
        />
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-4 lg:grid-cols-2">
          <KpiCard label="Lead-uri (12L)" value={conversie?.total_leads ?? '—'} />
          <KpiCard label="Convertiți" value={conversie?.convertiti ?? '—'} tone="positive" />
          <KpiCard label="Rată conversie" value={conversie ? `${conversie.procent}%` : '—'} tone="positive" />
          <KpiCard label="Zile medii → conversie" value={conversie?.zile_medii ?? '—'} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Leads pe lună</h3>
          {leadsLunaQ.isLoading ? <Spinner /> : <LeadsLunaChart rows={leadsLunaQ.data ?? []} />}
        </div>
      </div>
    </section>
  )
}
