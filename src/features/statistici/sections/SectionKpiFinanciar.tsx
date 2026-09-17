import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { isPrivileged, isAdminOrHigher } from '@/lib/rolesMatrix'
import { getKpis, type Interval } from '../api'
import { KpiCard } from '../KpiCard'
import { STAT_QO } from './shared'

export function SectionKpiFinanciar({ interval }: { interval: Interval }) {
  const { role } = useAuth()
  // Cheltuieli + profit sunt doar pentru manager+. Front_desk vede încasări,
  // restanțe, conversie, prezențe, ocupare — „satisfacția muncii", fără profit.
  const privileged = isPrivileged(role)

  const kpisQ = useQuery({
    queryKey: ['stat', 'kpis', interval],
    queryFn: () => getKpis(interval),
    ...STAT_QO,
  })

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Încasări"
        value={kpisQ.data ? formatRON(kpisQ.data.incasari) : '—'}
        tone="positive"
        hint="în intervalul ales"
      />
      {privileged && (
        <KpiCard
          label="Cheltuieli"
          value={kpisQ.data ? formatRON(kpisQ.data.cheltuieli) : '—'}
          tone="negative"
          hint="făcute în interval"
        />
      )}
      {isAdminOrHigher(role) && (
        <KpiCard
          label="Profit"
          value={kpisQ.data ? formatRON(kpisQ.data.profit) : '—'}
          tone={
            kpisQ.data && kpisQ.data.profit < 0 ? 'negative' : 'positive'
          }
          hint="încasări − cheltuieli"
        />
      )}
      <KpiCard
        label="Restanțe"
        value={kpisQ.data ? formatRON(kpisQ.data.restanteTotal) : '—'}
        tone="warning"
        hint="de recuperat (înrolări din interval, fără prescrise)"
      />
    </div>
  )
}
