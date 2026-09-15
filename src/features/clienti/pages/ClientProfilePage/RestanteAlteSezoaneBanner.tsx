import { formatDate, formatRON } from '@/lib/format'
import type { SezonOption } from '@/features/plati/api/sezoane'
import type { VDatoriiRest } from '@/types/db'
import type { ClientRestantaRow } from '../../api'

type Props = {
  rows: ClientRestantaRow[]
  sezoane: SezonOption[]
  sezonSelectat?: SezonOption
  onVeziSezon: (sezonId: string) => void
  /** Datorii one-off (bilete/merch/taxe) neachitate — nu apar în niciun tab al fișei. */
  datoriiOneOff?: VDatoriiRest[]
  onIncaseaza?: () => void
}

const CATEGORIE_LABEL: Record<string, string> = {
  Taxa: 'Taxă',
  Auditie: 'Audiție',
  Inchiriere: 'Închiriere',
}

const pillClass =
  'inline-flex items-center rounded-lg border border-red-300 bg-card px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:border-quasar-yellow hover:bg-quasar-yellow'

type Grup = {
  id: string | null
  nume: string
  start: string
  suma: number
  rate: number
}

const inInterval = (s: SezonOption | undefined, data: string) =>
  Boolean(
    s?.data_incepere &&
      s.data_final &&
      s.data_incepere <= data &&
      data <= s.data_final,
  )

// Fișa arată înrolările unui singur sezon, deci o restanță din alt sezon rămâne
// invizibilă până schimbi selectorul — bannerul o scoate la suprafață indiferent de
// sezonul afișat. Gruparea e pe intervalul de date al sezonului, exact ca lista
// (enrollments.sezon_id lipsește pe multe înrolări importate din v1).
export function RestanteAlteSezoaneBanner({
  rows,
  sezoane,
  sezonSelectat,
  onVeziSezon,
  datoriiOneOff = [],
  onIncaseaza,
}: Props) {
  const grupuri = new Map<string, Grup>()
  let prescris = 0
  for (const r of rows) {
    if (inInterval(sezonSelectat, r.data_incepere)) continue
    if (r.prescris) {
      prescris += Number(r.rest)
      continue
    }
    const s = sezoane.find((x) => inInterval(x, r.data_incepere))
    const key = s?.id ?? '-'
    const g = grupuri.get(key) ?? {
      id: s?.id ?? null,
      nume: s?.numele_sezonului ?? 'în afara sezoanelor',
      start: s?.data_incepere ?? '',
      suma: 0,
      rate: 0,
    }
    g.suma += Number(r.rest)
    g.rate += 1
    grupuri.set(key, g)
  }

  const lista = [...grupuri.values()].sort((a, b) => (a.start < b.start ? 1 : -1))
  const total = lista.reduce((a, g) => a + g.suma, 0)
  const oneOff = datoriiOneOff.filter((d) => Number(d.rest) > 0.004)
  const totalOneOff = oneOff.reduce((a, d) => a + Number(d.rest), 0)
  if (total <= 0.004 && totalOneOff <= 0.004) return null

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      {total > 0.004 && (
      <div>
      <p className="flex items-start gap-2">
        <span aria-hidden>⚠️</span>
        <span>
          <strong>Restanțe din alte sezoane: {formatRON(total)}</strong> — nu apar
          în lista sezonului afișat.
        </span>
      </p>
      <ul className="mt-2 space-y-1.5 pl-6">
        {lista.map((g) => (
          <li
            key={g.id ?? '-'}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <span>
              {g.nume}: <strong>{formatRON(g.suma)}</strong>
              <span className="text-red-700/80">
                {' '}
                · {g.rate === 1 ? '1 rată' : `${g.rate} rate`}
              </span>
            </span>
            {g.id && (
              // Pilulă mică, cu galbenul de brand doar pe hover: evidentă fără să strige.
              <button
                type="button"
                onClick={() => onVeziSezon(g.id!)}
                className={pillClass}
              >
                Vezi sezonul →
              </button>
            )}
          </li>
        ))}
      </ul>
      {prescris > 0.004 && (
        <p className="mt-2 pl-6 text-xs text-red-700/80">
          + {formatRON(prescris)} prescrise (mai vechi de 2 ani) — nu se mai
          recuperează.
        </p>
      )}
      </div>
      )}

      {totalOneOff > 0.004 && (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="flex items-start gap-2">
              <span aria-hidden>⚠️</span>
              <span>
                <strong>Bilete, merch sau taxe neachitate: {formatRON(totalOneOff)}</strong>{' '}
                — se încasează din „Plată".
              </span>
            </p>
            {onIncaseaza && (
              <button type="button" onClick={onIncaseaza} className={pillClass}>
                Încasează →
              </button>
            )}
          </div>
          <ul className="mt-2 space-y-1.5 pl-6">
            {oneOff.map((d) => (
              <li key={d.id}>
                {CATEGORIE_LABEL[d.categorie ?? ''] ?? d.categorie ?? 'Datorie'}
                {d.descriere ? ` · ${d.descriere}` : ''}: <strong>{formatRON(d.rest)}</strong>
                <span className="text-red-700/80"> · {formatDate(d.created)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
