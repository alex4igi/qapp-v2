import { useMemo } from 'react'
import type { CohortaRow } from './api'

// Heatmap retenție pe cohorte: rânduri = luna de start, coloane = luni de la
// start (0,1,2…). Culoarea celulei = % din cohortă încă prezent.
function cellColor(procent: number): string {
  // 0% roșu → 100% verde, prin galben.
  if (procent >= 90) return '#15803d'
  if (procent >= 75) return '#22c55e'
  if (procent >= 60) return '#84cc16'
  if (procent >= 45) return '#eab308'
  if (procent >= 30) return '#f59e0b'
  if (procent >= 15) return '#f97316'
  return '#ef4444'
}

function formatCohorta(luna: string): string {
  const [y, m] = luna.split('-')
  return `${m}.${y.slice(2)}`
}

export function RetentieCohorteTable({ rows }: { rows: CohortaRow[] }) {
  const { cohorte, maxOffset, byKey, totals } = useMemo(() => {
    const cohorteSet = new Set<string>()
    let maxOff = 0
    const byKey = new Map<string, CohortaRow>()
    const totals = new Map<string, number>()
    for (const r of rows) {
      cohorteSet.add(r.cohorta_luna)
      if (r.luni_de_la_start > maxOff) maxOff = r.luni_de_la_start
      byKey.set(`${r.cohorta_luna}:${r.luni_de_la_start}`, r)
      if (r.luni_de_la_start === 0) totals.set(r.cohorta_luna, r.total_initial)
    }
    return {
      cohorte: [...cohorteSet].sort(),
      maxOffset: maxOff,
      byKey,
      totals,
    }
  }, [rows])

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Fără cohorte în fereastra analizată.
      </p>
    )
  }

  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <table className="text-xs">
        <thead>
          <tr className="text-quasar-gray">
            <th className="sticky left-0 bg-white px-2 py-1 text-left font-medium">
              Luna start
            </th>
            <th className="px-2 py-1 text-right font-medium">Start</th>
            {offsets.map((o) => (
              <th key={o} className="px-2 py-1 text-center font-medium">
                +{o}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorte.map((cohorta) => (
            <tr key={cohorta}>
              <td className="sticky left-0 bg-white px-2 py-1 font-medium text-quasar-black">
                {formatCohorta(cohorta)}
              </td>
              <td className="px-2 py-1 text-right text-quasar-gray">
                {totals.get(cohorta) ?? '—'}
              </td>
              {offsets.map((o) => {
                const cell = byKey.get(`${cohorta}:${o}`)
                if (!cell) {
                  return <td key={o} className="px-2 py-1" />
                }
                return (
                  <td key={o} className="px-1 py-1 text-center">
                    <span
                      className="inline-block min-w-[34px] rounded px-1.5 py-0.5 font-medium text-white"
                      style={{ backgroundColor: cellColor(cell.procent) }}
                      title={`${cell.ramasi}/${cell.total_initial}`}
                    >
                      {cell.procent}%
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-2 text-xs text-quasar-gray">
        Din cei care au început într-o lună, ce procent mai vin după N luni (pe
        coloane: +1, +2…). Verde = rămân, roșu = pleacă.
      </p>
    </div>
  )
}
