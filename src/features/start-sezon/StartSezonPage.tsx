import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Select, Spinner } from '@/components/ui'
import { KpiCard } from '@/features/statistici/KpiCard'
import {
  getStartSezonNerevenit,
  getStartSezonNoi,
  getStartSezonRetentie,
  getStartSezonRoster,
  getStartSezonSumar,
  listSezoanePrincipale,
} from './api'
import { NerevenitSection } from './components/NerevenitSection'
import { NoiSection } from './components/NoiSection'
import { RetentieSection } from './components/RetentieSection'
import { RosterSection } from './components/RosterSection'

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

/** „a început pe 12 septembrie, acum 3 zile" / „începe pe 12 septembrie, peste 3 zile" */
function cadranTemporal(startIso: string): string {
  const start = new Date(`${startIso}T00:00:00`)
  const azi = new Date()
  azi.setHours(0, 0, 0, 0)
  const zile = Math.round((start.getTime() - azi.getTime()) / 86_400_000)
  const data = `${start.getDate()} ${LUNI[start.getMonth()]}`
  if (zile > 1) return `începe pe ${data}, peste ${zile} zile`
  if (zile === 1) return `începe mâine, ${data}`
  if (zile === 0) return `a început astăzi, ${data}`
  if (zile === -1) return `a început ieri, ${data}`
  return `a început pe ${data}, acum ${-zile} zile`
}

export function StartSezonPage() {
  const [sezonId, setSezonId] = useState('')

  const sezoaneQ = useQuery({
    queryKey: ['start-sezon', 'sezoane'],
    queryFn: listSezoanePrincipale,
  })

  // Implicit: sezonul activ. Dacă nu există unul activ (între sezoane), cel mai recent.
  useEffect(() => {
    if (sezonId || !sezoaneQ.data?.length) return
    const activ = sezoaneQ.data.find((s) => s.stare === 'activ')
    setSezonId((activ ?? sezoaneQ.data[0]).id)
  }, [sezonId, sezoaneQ.data])

  const sezon = useMemo(
    () => sezoaneQ.data?.find((s) => s.id === sezonId) ?? null,
    [sezoaneQ.data, sezonId],
  )

  const on = { enabled: Boolean(sezonId) }
  const sumarQ = useQuery({
    queryKey: ['start-sezon', 'sumar', sezonId],
    queryFn: () => getStartSezonSumar(sezonId),
    ...on,
  })
  const nerevenitQ = useQuery({
    queryKey: ['start-sezon', 'nerevenit', sezonId],
    queryFn: () => getStartSezonNerevenit(sezonId),
    ...on,
  })
  const retentieQ = useQuery({
    queryKey: ['start-sezon', 'retentie', sezonId],
    queryFn: () => getStartSezonRetentie(sezonId),
    ...on,
  })
  const noiQ = useQuery({
    queryKey: ['start-sezon', 'noi', sezonId],
    queryFn: () => getStartSezonNoi(sezonId),
    ...on,
  })
  const rosterQ = useQuery({
    queryKey: ['start-sezon', 'roster', sezonId],
    queryFn: () => getStartSezonRoster(sezonId),
    ...on,
  })

  const s = sumarQ.data ?? null
  const nerevenit = s ? s.pool_total - s.pool_revenit : 0
  const retentiePct =
    s && s.pool_total > 0 ? Math.round((s.pool_revenit / s.pool_total) * 100) : 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Start de sezon"
        subtitle={
          sezon
            ? `${sezon.numele_sezonului} ${cadranTemporal(sezon.data_incepere)}. Cifrele se recalculează de fiecare dată când deschizi pagina.`
            : 'Cum arată sezonul în primele săptămâni: cine s-a întors, cine nu, cine e nou.'
        }
        actions={
          <div className="w-64">
            {sezoaneQ.isLoading ? (
              <Spinner />
            ) : (
              <Select
                options={(sezoaneQ.data ?? []).map((x) => ({
                  value: x.id,
                  label: x.numele_sezonului,
                }))}
                value={sezonId}
                onChange={(e) => setSezonId(e.target.value)}
                aria-label="Sezon"
              />
            )}
          </div>
        }
      />

      {sumarQ.isLoading ? (
        <Spinner />
      ) : sumarQ.isError ? (
        <p className="text-sm text-danger">
          Nu am putut calcula sumarul: {(sumarQ.error as Error).message}
        </p>
      ) : s ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Înrolări în sezon"
            value={s.inrolari}
            hint="perechi cursant + grupă, nu rânduri de plată"
          />
          <KpiCard
            label="Grupe cu cursanți"
            value={`${s.grupe_active} / ${s.grupe_total}`}
            hint="din cele create pentru sezon"
          />
          <KpiCard
            label="Nu s-au întors"
            value={nerevenit}
            tone={nerevenit > 0 ? 'warning' : 'positive'}
            hint={`din ${s.pool_total} câți erau la finalul sezonului trecut (retenție ${retentiePct}%)`}
          />
          <KpiCard
            label="Clienți complet noi"
            value={s.clienti_noi}
            tone="positive"
            hint="fără nicio urmă anterioară la Quasar"
          />
          <KpiCard
            label="Reînscrieri"
            value={s.reinscrieri}
            hint="înrolări cu preț promo de reînscriere în aplicație"
          />
        </div>
      ) : (
        <p className="text-sm text-muted">Alege un sezon.</p>
      )}

      {nerevenitQ.isLoading ? (
        <Spinner />
      ) : (
        <NerevenitSection rows={nerevenitQ.data ?? []} />
      )}

      {retentieQ.isLoading ? (
        <Spinner />
      ) : (
        <RetentieSection rows={retentieQ.data ?? []} />
      )}

      {rosterQ.isLoading ? <Spinner /> : <RosterSection rows={rosterQ.data ?? []} />}

      {noiQ.isLoading ? <Spinner /> : <NoiSection rows={noiQ.data ?? []} />}

      <details className="rounded-2xl border border-line bg-card p-5 text-sm text-muted-2">
        <summary className="cursor-pointer font-display text-base font-semibold text-ink">
          Cum sunt numărate cifrele
        </summary>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong className="text-ink">O înrolare = o pereche cursant + grupă.</strong>{' '}
            Modelul „per lună" scrie un rând pentru fiecare lună a sezonului, deci
            numărul de rânduri din baza de date e de vreo zece ori mai mare.
          </li>
          <li>
            <strong className="text-ink">Rezilierea se citește din data de reziliere</strong>,
            nu din bifa „reziliat" — bifa aia se pune și pe lunile încheiate normal, deci
            ar tăia oameni care n-au plecat nicăieri.
          </li>
          <li>
            <strong className="text-ink">„Cine era în casă"</strong> = abonamente plătite și
            nereziliate începute în ultimele cinci luni dinaintea startului de sezon. Pentru
            un sezon care începe în septembrie asta înseamnă aprilie–iunie plus vara.
          </li>
          <li>
            <strong className="text-ink">Luna de start nu contează ca istoric.</strong> Cine
            plătește prima rată cu o săptămână înainte de start rămâne „client complet nou";
            altfel plata proprie l-ar face să pară vechi.
          </li>
        </ul>
      </details>
    </div>
  )
}
