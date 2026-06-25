import { useNavigate } from 'react-router-dom'
import type { InstructorTrendRow } from './api'
import { Sparkline } from './Sparkline'

// Feature „1 click instructor": câți clienți are fiecare instructor, dacă
// pierde/câștigă (delta lună-vs-lună) + sparkline. Click pe rând → fișa lui.
export function InstructoriTrendCard({ rows }: { rows: InstructorTrendRow[] }) {
  const navigate = useNavigate()

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Niciun instructor cu clienți activi.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-quasar-gray-light text-left text-xs uppercase tracking-wide text-quasar-gray">
            <th className="px-3 py-2 font-medium">Instructor</th>
            <th className="px-3 py-2 text-right font-medium">Clienți</th>
            <th className="px-3 py-2 text-right font-medium">Δ vs luna trecută</th>
            <th className="px-3 py-2 text-right font-medium">Retenție</th>
            <th className="px-3 py-2 text-right font-medium">Evoluție</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const up = r.delta > 0
            const down = r.delta < 0
            return (
              <tr
                key={r.teacher_id}
                onClick={() => navigate(`/teacheri/${r.teacher_id}`)}
                className="cursor-pointer border-b border-quasar-gray-light transition-colors last:border-0 hover:bg-quasar-yellow/10"
                title="Vezi fișa instructorului"
              >
                <td className="px-3 py-2 font-medium text-quasar-black">
                  {r.teacher_nume}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-quasar-black">
                  {r.clienti_curent}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold ${
                    up ? 'text-green-700' : down ? 'text-red-600' : 'text-quasar-gray'
                  }`}
                >
                  {up ? '▲' : down ? '▼' : '–'} {up ? '+' : ''}
                  {r.delta}
                </td>
                <td className="px-3 py-2 text-right text-quasar-gray">
                  {r.retentie_procent != null ? `${r.retentie_procent}%` : '—'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <Sparkline
                      values={r.serie}
                      color={down ? '#dc2626' : '#16a34a'}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-quasar-gray-light px-3 py-2 text-xs text-quasar-gray">
        Clienți distincți prezenți în luna încheiată, la cursurile instructorului
        (titular + co-titular). Δ și retenția compară ultimele 2 luni încheiate —
        arată cine nu mai vine. Click pe un rând pentru fișa instructorului.
      </p>
    </div>
  )
}
