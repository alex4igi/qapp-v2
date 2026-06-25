import { useMemo } from 'react'
import { formatRON } from '@/lib/format'
import type { RentabilitateGrupaRow } from '@/features/analytics/api'

// Prag de rentabilitate per grupă: câți cursanți acoperă costul instructorului.
// Cost lunar ≈ salariu_atribuit/12; preț/client/lună ≈ încasări/activi/12.
// Break-even = cost lunar / preț per client. Sub prag = grupă de comasat/scrutinizat.
export function BreakEvenTable({ rows }: { rows: RentabilitateGrupaRow[] }) {
  const calc = useMemo(
    () =>
      rows
        .map((r) => {
          const pretClientLuna = r.activi > 0 ? r.incasari / r.activi / 12 : 0
          const costLunar = r.salariu_atribuit / 12
          const breakEven = pretClientLuna > 0 ? Math.ceil(costLunar / pretClientLuna) : null
          const acoperit = breakEven != null ? r.activi >= breakEven : null
          return { ...r, pretClientLuna, costLunar, breakEven, acoperit }
        })
        .sort((a, b) => {
          // Sub prag primele; apoi cele mai aproape de prag.
          const ra = a.acoperit === false ? 0 : 1
          const rb = b.acoperit === false ? 0 : 1
          if (ra !== rb) return ra - rb
          return (a.activi - (a.breakEven ?? 0)) - (b.activi - (b.breakEven ?? 0))
        }),
    [rows],
  )

  const faraSalarii = rows.length > 0 && rows.every((r) => r.salariu_atribuit === 0)

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-quasar-gray">Nicio grupă.</p>
  }

  return (
    <div className="max-h-96 overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-quasar-gray-light text-left text-xs uppercase tracking-wide text-quasar-gray">
            <th className="px-3 py-2 font-medium">Grupă</th>
            <th className="px-3 py-2 text-right font-medium">Activi</th>
            <th className="px-3 py-2 text-right font-medium">Preț/client/lună</th>
            <th className="px-3 py-2 text-right font-medium">Cost lunar</th>
            <th className="px-3 py-2 text-right font-medium">Prag (clienți)</th>
            <th className="px-3 py-2 text-center font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {calc.map((r) => (
            <tr key={r.curs_id} className="border-b border-quasar-gray-light last:border-0">
              <td className="px-3 py-2 font-medium text-quasar-black">{r.curs_nume}</td>
              <td className="px-3 py-2 text-right text-quasar-black">{r.activi}</td>
              <td className="px-3 py-2 text-right text-quasar-gray">
                {r.pretClientLuna > 0 ? formatRON(Math.round(r.pretClientLuna)) : '—'}
              </td>
              <td className="px-3 py-2 text-right text-quasar-gray">
                {r.costLunar > 0 ? formatRON(Math.round(r.costLunar)) : '—'}
              </td>
              <td className="px-3 py-2 text-right font-medium text-quasar-black">
                {r.breakEven != null ? r.breakEven : '—'}
              </td>
              <td className="px-3 py-2 text-center">
                {r.acoperit == null ? (
                  <span className="text-xs text-quasar-gray">—</span>
                ) : r.acoperit ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                    acoperit
                  </span>
                ) : (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    sub prag
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {faraSalarii && (
        <p className="border-t border-quasar-gray-light px-3 py-2 text-xs text-quasar-gray">
          Pragul se activează când salariile sunt calculate pe interval — momentan
          costul instructorului e 0, deci toate grupele apar „acoperite".
        </p>
      )}
    </div>
  )
}
