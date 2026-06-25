import { useNavigate } from 'react-router-dom'
import type { AbsentaRow } from './api'

function formatData(d: string | null): string {
  if (!d) return 'niciodată'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y.slice(2)}`
}

// Cursanți cu absențe consecutive — flag de intervenție înainte să plece.
export function AbsenteConsecutiveTable({ rows }: { rows: AbsentaRow[] }) {
  const navigate = useNavigate()

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Niciun cursant cu absențe consecutive peste prag. 🎉
      </p>
    )
  }

  return (
    <div className="max-h-96 overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-quasar-gray-light text-left text-xs uppercase tracking-wide text-quasar-gray">
            <th className="px-3 py-2 font-medium">Cursant</th>
            <th className="px-3 py-2 font-medium">Grupă</th>
            <th className="px-3 py-2 text-center font-medium">Absențe</th>
            <th className="px-3 py-2 text-right font-medium">Ultima prezență</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.client_id}:${r.curs_id}`}
              onClick={() => navigate(`/clienti/${r.client_id}`)}
              className="cursor-pointer border-b border-quasar-gray-light transition-colors last:border-0 hover:bg-quasar-yellow/10"
              title="Vezi fișa cursantului"
            >
              <td className="px-3 py-2 font-medium text-quasar-black">
                {r.client_nume}
              </td>
              <td className="px-3 py-2 text-quasar-gray">{r.curs_nume}</td>
              <td className="px-3 py-2 text-center">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.absente_consecutive >= 3
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {r.absente_consecutive}×
                </span>
              </td>
              <td className="px-3 py-2 text-right text-quasar-gray">
                {formatData(r.ultima_prezenta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
