import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { listPreturiCursuriReferinta, type PretCursReferinta } from './api'

// Pas 3: panou de REFERINȚĂ (nu sursă). Arată prețurile reale de facturare din `cursuri`
// (sezon activ) lângă oferta publică editabilă, ca staff-ul să vadă drift-ul marketing ↔
// facturare. NU facem merge: oferta publică e ~câteva tier-uri curate, cursurile sunt ~zeci.

// Agregare valori distincte ale unui câmp de preț → [valoare, nr. cursuri], crescător.
function distinct(
  rows: PretCursReferinta[],
  key: 'pret_lunar' | 'pret_anual' | 'pret_sedinta',
): Array<[number, number]> {
  const map = new Map<number, number>()
  for (const r of rows) {
    const v = r[key]
    if (v == null) continue
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0])
}

function PriceRow({ label, pairs }: { label: string; pairs: Array<[number, number]> }) {
  if (pairs.length === 0) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1">
      <span className="w-28 shrink-0 text-sm font-medium text-quasar-black">{label}</span>
      <span className="flex flex-wrap gap-1.5">
        {pairs.map(([val, count]) => (
          <span
            key={val}
            className="rounded bg-quasar-gray-light/60 px-1.5 py-0.5 text-xs text-quasar-black"
            title={`${count} ${count === 1 ? 'curs' : 'cursuri'}`}
          >
            {val} lei
            <span className="text-quasar-gray"> ×{count}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

export function PreturiReferintaPanel() {
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['preturi_cursuri_referinta'],
    queryFn: listPreturiCursuriReferinta,
    enabled: open,
  })

  const rows = query.data ?? []
  const lunar = useMemo(() => distinct(rows, 'pret_lunar'), [rows])
  const anual = useMemo(() => distinct(rows, 'pret_anual'), [rows])
  const sedinta = useMemo(() => distinct(rows, 'pret_sedinta'), [rows])

  return (
    <div className="mt-4 rounded-md border border-quasar-gray-light bg-quasar-gray-light/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-quasar-black"
      >
        <span>Referință: prețuri reale de facturare (din cursuri)</span>
        <span className="text-quasar-gray">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-quasar-gray-light px-3 py-3">
          <p className="mb-3 text-xs text-quasar-gray">
            Prețurile efective cu care se facturează cursurile sezonului activ. Oferta publică de mai
            sus e <strong>decuplată</strong> de acestea (text de marketing curat) — folosește lista ca
            să verifici că nu diverg. <strong>Atenție la drift:</strong> discountul pe plata integrală
            din <code>pret_anual</code> a fost istoric 10%, iar contractul cere 5% — verifică valorile
            anuale înainte de a comunica un preț.
          </p>

          {query.isLoading ? (
            <Spinner />
          ) : query.isError ? (
            <p className="text-sm text-red-600">Eroare la încărcarea prețurilor de referință.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-quasar-gray">
              Niciun curs nesuspendat în sezonul activ (sau niciun sezon activ).
            </p>
          ) : (
            <div className="space-y-0.5">
              <p className="mb-2 text-xs text-quasar-gray">
                {rows.length} cursuri · valori distincte (× = câte cursuri la acel preț):
              </p>
              <PriceRow label="Lunar" pairs={lunar} />
              <PriceRow label="Anual (integral)" pairs={anual} />
              <PriceRow label="Per ședință" pairs={sedinta} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
