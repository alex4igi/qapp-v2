import { useQuery } from '@tanstack/react-query'
import { getConversieLeads } from '@/features/ansamblu/api'
import { KpiCard } from '../KpiCard'
import { STAT_QO } from './shared'

// Gate-ul de rol (privileged) e la montare, în StatisticiPage.
export function SectionConversieLeads() {
  const conversieQ = useQuery({
    queryKey: ['stat', 'conversie-leads'],
    queryFn: () => getConversieLeads(12),
    ...STAT_QO,
  })

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-quasar-black">
        Conversie lead → client (ultimele 12 luni)
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Lead-uri intrate"
          value={conversieQ.data?.total_leads ?? '—'}
        />
        <KpiCard
          label="Convertiți"
          value={conversieQ.data?.convertiti ?? '—'}
          tone="positive"
        />
        <KpiCard
          label="Rată conversie"
          value={conversieQ.data ? `${conversieQ.data.procent}%` : '—'}
          tone="positive"
        />
        <KpiCard
          label="Zile medii până la conversie"
          value={conversieQ.data?.zile_medii ?? '—'}
        />
      </div>
    </section>
  )
}
