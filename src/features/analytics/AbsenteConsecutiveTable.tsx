import { useNavigate } from 'react-router-dom'
import type { AbsentaRow } from './api'

function formatData(d: string | null): string {
  if (!d) return 'niciodată'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y.slice(2)}`
}

// Cursanți care au încetat să vină — ședințe ținute de grupă de la ultimul lor
// semnal. Flag de intervenție înainte să plece de tot.
export function AbsenteConsecutiveTable({ rows }: { rows: AbsentaRow[] }) {
  const navigate = useNavigate()

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Niciun cursant peste prag — toți vin constant. 🎉
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
            <th className="px-3 py-2 text-center font-medium">Ratate / tăcere</th>
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
              <td className="px-3 py-2 text-quasar-gray">
                {r.curs_nume}
                {r.vine_la && (
                  <span className="mt-0.5 block text-[11px] font-medium text-blue-700">
                    ↪ vine la: {r.vine_la}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-center">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.zile_tacere >= 21
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                  title={`Grupa are ${r.lectii_pe_saptamana} ședințe pe săptămână`}
                >
                  {r.sedinte_ratate}×
                </span>
                <span className="mt-0.5 block text-[11px] text-quasar-gray">
                  {r.zile_tacere} zile
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
