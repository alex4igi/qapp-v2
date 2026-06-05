import { Spinner } from '@/components/ui'
import type { getClientPrezenteSezon } from '../../../api'

type PrezenteRow = Awaited<ReturnType<typeof getClientPrezenteSezon>>[number]

type Props = {
  loading: boolean
  rows: PrezenteRow[]
}

export function PrezenteSezonTab({ loading, rows }: Props) {
  if (loading) return <Spinner />
  if (rows.length === 0) {
    return <p className="text-sm text-quasar-gray">Nicio prezență în acest sezon.</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-quasar-gray-light bg-white">
      <table className="w-full text-sm">
        <thead className="bg-quasar-gray-light/50 text-left text-xs uppercase text-quasar-gray">
          <tr>
            <th className="px-4 py-2">Nume curs</th>
            <th className="px-4 py-2">Data</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-quasar-gray-light">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2">{p.cursul?.numele ?? '—'}</td>
              <td className="px-4 py-2">{p.data ?? '—'}</td>
              <td className="px-4 py-2">
                {p.status === 'Prezent' && (
                  <span className="text-emerald-700">● Prezent</span>
                )}
                {p.status === 'Absent' && (
                  <span className="text-red-700">● Absent</span>
                )}
                {p.status === 'Motivat' && (
                  <span className="text-amber-700">● Motivat</span>
                )}
                {!p.status && <span className="text-quasar-gray">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
