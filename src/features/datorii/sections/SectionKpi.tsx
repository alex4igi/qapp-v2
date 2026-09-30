import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { KpiCard } from '@/features/statistici/KpiCard'
import { listPraguri } from '@/features/scorecard/api'
import { getDatoriiDashboard, getRestanteScadente, rataRestantePct, restLuna, sumDatorii } from '../api'
import { praguriRata, semaforRataRestante, SEMAFOR_TONE } from '../semafor'
import { DATORII_QO, LUNA_CURENTA_LABEL } from './shared'

export function SectionKpi({ locatieId }: { locatieId: string | null }) {
  const dashQ = useQuery({
    queryKey: ['datorii', 'dashboard', locatieId],
    queryFn: () => getDatoriiDashboard(locatieId),
    ...DATORII_QO,
  })
  const restanteQ = useQuery({
    queryKey: ['datorii', 'restante-scadente', locatieId],
    queryFn: () => getRestanteScadente(locatieId),
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
  const restRecuperabil = restLuna(total)
  const restante = restanteQ.data?.total

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Rest recuperabil"
          value={formatRON(restRecuperabil)}
          tone={restRecuperabil > 0 ? 'negative' : 'positive'}
          hint={`facturat în ${LUNA_CURENTA_LABEL}, încă neîncasat`}
        />
        <KpiCard
          label="din care one-off"
          value={formatRON(total.rest_luna_oneoff)}
          hint="bilete · taxe · merch"
        />
        <KpiCard
          label="Datornici"
          value={restante ? restante.clienti : '—'}
          hint="plăți trecute de termen, toate lunile"
        />
        <KpiCard
          label="Recuperat în lună"
          value={formatRON(total.recuperat_luna)}
          tone={total.recuperat_luna > 0 ? 'positive' : 'default'}
          hint="încasat acum, din datorii mai vechi"
        />
        <KpiCard
          label="Rata restanțe"
          value={rata == null ? '—' : `${rata}%`}
          tone={semafor ? SEMAFOR_TONE[semafor] : 'default'}
          hint={`pe ${LUNA_CURENTA_LABEL} · țintă ≤${peste}% · atenție ≤${standard}%`}
        />
      </div>
      <p className="mt-2 text-xs text-muted-2">
        Cifrele de sus sunt pe luna curentă — pe ea se conduce recuperarea, inclusiv partea
        încă nescadentă. Restanțe:{' '}
        {restante ? formatRON(restante.lei) : '—'} trecuți de termen, pe toate lunile
        (ședința se plătește în ziua ei, abonamentul până pe 15, taxele pe loc; include
        one-off). Prescris, peste 2 ani, nu se mai urmărește: {formatRON(total.rest_prescris)}.
      </p>
    </div>
  )
}
