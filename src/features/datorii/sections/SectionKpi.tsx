import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { KpiCard } from '@/features/statistici/KpiCard'
import { listPraguri } from '@/features/scorecard/api'
import { getDatoriiDashboard, rataRestantePct, sumDatorii } from '../api'
import { praguriRata, semaforRataRestante, SEMAFOR_TONE } from '../semafor'
import { DATORII_QO } from './shared'

export function SectionKpi({ locatieId }: { locatieId: string | null }) {
  const dashQ = useQuery({
    queryKey: ['datorii', 'dashboard', locatieId],
    queryFn: () => getDatoriiDashboard(locatieId),
    ...DATORII_QO,
  })
  const praguriQ = useQuery({
    queryKey: ['scorecard', 'praguri'],
    queryFn: listPraguri,
    ...DATORII_QO,
  })

  if (dashQ.isLoading) return <Spinner />
  if (dashQ.isError)
    return <p className="text-sm text-red-600">Eroare: {humanizeError(dashQ.error)}</p>

  const total = sumDatorii(dashQ.data ?? [])
  const rata = rataRestantePct(total)
  const semafor = semaforRataRestante(rata, praguriQ.data)
  const { peste, standard } = praguriRata(praguriQ.data)
  const restRecuperabil = total.rest_net + total.rest_oneoff

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Rest recuperabil"
          value={formatRON(restRecuperabil)}
          tone={restRecuperabil > 0 ? 'negative' : 'positive'}
          hint="abonamente + one-off"
        />
        <KpiCard
          label="din care one-off"
          value={formatRON(total.rest_oneoff)}
          hint="bilete · taxe · merch"
        />
        <KpiCard
          label="Datornici"
          value={total.nr_datornici}
          hint={locatieId ? 'clienți cu rest' : 'pe locații'}
        />
        <KpiCard
          label="Prescrise"
          value={formatRON(total.rest_prescris)}
          hint="peste 2 ani — nu intră în total"
        />
        <KpiCard
          label="Rata restanțe"
          value={rata == null ? '—' : `${rata}%`}
          tone={semafor ? SEMAFOR_TONE[semafor] : 'default'}
          hint={`țintă ≤${peste}% · atenție ≤${standard}%`}
        />
      </div>
      <p className="mt-2 text-xs text-muted-2">
        Definiție: net — fără prescrise, rezilieri și luni facturate în viitor;
        include datoriile one-off. Aceeași bază în /financiar, worklist și SMS.
      </p>
    </div>
  )
}
