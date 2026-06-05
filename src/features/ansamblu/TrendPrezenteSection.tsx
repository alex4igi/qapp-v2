import { useMemo, useState } from 'react'
import type { TrendPrezenteRow } from './api'
import { TrendPrezenteCard } from './TrendPrezenteCard'

type Grup = {
  teacher: string
  rows: TrendPrezenteRow[]
  nScadere: number
}

export function TrendPrezenteSection({ rows }: { rows: TrendPrezenteRow[] }) {
  const [doarScadere, setDoarScadere] = useState(true)

  const totalScadere = rows.filter((r) => r.in_scadere).length

  const grupuri = useMemo<Grup[]>(() => {
    const vizibile = doarScadere ? rows.filter((r) => r.in_scadere) : rows
    const map = new Map<string, TrendPrezenteRow[]>()
    for (const r of vizibile) {
      const key = r.teacher_nume || 'Fără instructor'
      const arr = map.get(key) ?? []
      arr.push(r)
      map.set(key, arr)
    }
    return Array.from(map.entries())
      .map(([teacher, gr]) => ({
        teacher,
        rows: gr,
        nScadere: gr.filter((r) => r.in_scadere).length,
      }))
      .sort((a, b) => b.nScadere - a.nScadere || a.teacher.localeCompare(b.teacher))
  }, [rows, doarScadere])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">
          Trend prezențe
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-quasar-gray">
            {totalScadere > 0
              ? `${totalScadere} ${totalScadere === 1 ? 'curs' : 'cursuri'} în scădere`
              : 'niciun curs în scădere'}
          </span>
          <button
            type="button"
            onClick={() => setDoarScadere((v) => !v)}
            className="rounded border border-quasar-gray-light bg-white px-2 py-1 text-xs font-medium text-quasar-black hover:bg-quasar-gray-light/40"
          >
            {doarScadere ? 'Arată toate cursurile' : 'Doar cele în scădere'}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-quasar-gray">
        Rata = prezenți / înrolați, pe săptămână (exclus vacanțele). Roșu =
        scădere ≥5pp în ultimele 3 săptămâni față de cele 3 anterioare.
      </p>

      {grupuri.length === 0 ? (
        <div className="rounded-lg border border-quasar-gray-light bg-white p-6 text-sm text-quasar-gray">
          {doarScadere
            ? 'Niciun curs în scădere. 🎉'
            : 'Nu există date de prezență suficiente pentru un trend.'}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {grupuri.map((g) => (
            <div key={g.teacher}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-quasar-black">
                  {g.teacher}
                </h3>
                <span className="text-xs text-quasar-gray">
                  {g.rows.length} {g.rows.length === 1 ? 'curs' : 'cursuri'}
                  {g.nScadere > 0 && (
                    <span className="text-red-600">
                      {' '}
                      · {g.nScadere} în scădere
                    </span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.rows.map((row) => (
                  <TrendPrezenteCard key={row.curs_id} row={row} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
