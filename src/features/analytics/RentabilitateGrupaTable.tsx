import { useNavigate } from 'react-router-dom'
import { formatRON } from '@/lib/format'
import type { RentabilitateGrupaRow } from './api'

// Marjă per grupă (încasări 12 luni − cotă salariu titular). Cele mai slabe
// primele — candidate la comasare/închidere.
export function RentabilitateGrupaTable({ rows }: { rows: RentabilitateGrupaRow[] }) {
  const navigate = useNavigate()

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-quasar-gray">
        Nicio grupă recurentă cu activitate.
      </p>
    )
  }

  return (
    <div className="max-h-96 overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-quasar-gray-light text-left text-xs uppercase tracking-wide text-quasar-gray">
            <th className="px-3 py-2 font-medium">Grupă</th>
            <th className="px-3 py-2 text-right font-medium">Activi</th>
            <th className="px-3 py-2 text-right font-medium">Încasări 12L</th>
            <th className="px-3 py-2 text-right font-medium">Salariu (cotă)</th>
            <th className="px-3 py-2 text-right font-medium">Marjă</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.curs_id}
              onClick={() => navigate(`/cursuri/${r.curs_id}`)}
              className="cursor-pointer border-b border-quasar-gray-light transition-colors last:border-0 hover:bg-quasar-yellow/10"
            >
              <td className="px-3 py-2">
                <div className="font-medium text-quasar-black">{r.curs_nume}</div>
                {r.locatie_nume && (
                  <div className="text-xs text-quasar-gray">{r.locatie_nume}</div>
                )}
              </td>
              <td className="px-3 py-2 text-right text-quasar-black">{r.activi}</td>
              <td className="px-3 py-2 text-right text-quasar-black">
                {formatRON(r.incasari)}
              </td>
              <td className="px-3 py-2 text-right text-quasar-gray">
                {formatRON(r.salariu_atribuit)}
              </td>
              <td
                className={`px-3 py-2 text-right font-semibold ${
                  r.marja < 0 ? 'text-red-600' : 'text-green-700'
                }`}
              >
                {formatRON(r.marja)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-quasar-gray-light px-3 py-2 text-xs text-quasar-gray">
        Salariul e repartizat din total instructor / nr. grupe (aproximare — nu se
        ține pe grupă). Marjă negativă = grupă de scrutinizat.
      </p>
    </div>
  )
}
