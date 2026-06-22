import { Spinner } from '@/components/ui'
import type { CursFaraPrezentaRow } from '../../../api'
import { formatData, fullName } from '../helpers'

type Props = {
  loading: boolean
  rows: CursFaraPrezentaRow[]
  onRowClick: (clientId: string) => void
}

export function AbsentiTab({ loading, rows, onRowClick }: Props) {
  if (loading) return <div className="mt-4"><Spinner /></div>
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-quasar-gray shadow-sm">
        Toți clienții activi au prezență în ultimele 21 de zile.
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
            <th className="px-3 py-2">Ultima prezență</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r, i) => (
            <tr
              key={r.clientId}
              className="cursor-pointer hover:bg-quasar-yellow/10"
              onClick={() => onRowClick(r.clientId)}
            >
              <td className="px-3 py-2 text-right text-quasar-gray">{i + 1}.</td>
              <td className="px-3 py-2 font-medium text-quasar-black">
                {fullName(r.nume, r.prenume)}
              </td>
              <td className="px-3 py-2 text-quasar-black">
                {formatData(r.ultimaPrezenta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
