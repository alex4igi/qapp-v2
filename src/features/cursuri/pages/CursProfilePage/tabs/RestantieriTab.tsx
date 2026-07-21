import { Spinner } from '@/components/ui'
import type { CursDatorieRow } from '../../../api'
import { fullName } from '../helpers'

type Props = {
  loading: boolean
  rows: CursDatorieRow[]
  // Încasarea e responsabilitatea front_desk/manager — pentru teacher butonul
  // rămâne vizibil dar dezactivat.
  canPay?: boolean
  onRowClick: (clientId: string) => void
  onPayClick: (clientId: string) => void
}

export function RestantieriTab({ loading, rows, canPay = true, onRowClick, onPayClick }: Props) {
  if (loading) return <div className="mt-4"><Spinner /></div>
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-quasar-gray shadow-sm">
        Niciun restanțier la acest curs în sezonul curent.
      </p>
    )
  }
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-quasar-gray">
          <tr>
            <th className="w-10 px-3 py-2 text-right">#</th>
            <th className="px-3 py-2">Nume</th>
            <th className="px-3 py-2 text-right">Restanță</th>
            <th className="w-32 px-3 py-2 text-right">Acțiune</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r, i) => (
            <tr key={r.clientId} className="hover:bg-quasar-yellow/10">
              <td className="px-3 py-2 text-right text-quasar-gray">{i + 1}.</td>
              <td className="px-3 py-2 font-medium text-quasar-black">
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => onRowClick(r.clientId)}
                >
                  {fullName(r.nume, r.prenume)}
                </button>
              </td>
              <td className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Restanță {r.rest} RON
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  disabled={!canPay}
                  onClick={() => onPayClick(r.clientId)}
                  className="rounded-full bg-quasar-yellow px-3 py-1 text-xs font-bold text-quasar-black transition-colors hover:bg-quasar-yellow/80 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-quasar-yellow"
                  title={canPay ? undefined : 'Încasările le face recepția'}
                >
                  Plată nouă
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
