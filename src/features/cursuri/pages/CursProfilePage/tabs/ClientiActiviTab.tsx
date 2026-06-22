import { Spinner } from '@/components/ui'
import type { CursClientActiv } from '../../../api'
import { formatData, fullName } from '../helpers'

type Props = {
  loading: boolean
  rows: CursClientActiv[]
  pretLunarPromo: number | null
  onRowClick: (clientId: string) => void
  onActivateReinscriere: (clientId: string) => void
  activatingClientId: string | null
}

export function ClientiActiviTab({
  loading,
  rows,
  pretLunarPromo,
  onRowClick,
  onActivateReinscriere,
  activatingClientId,
}: Props) {
  if (loading) return <div className="mt-4"><Spinner /></div>
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-quasar-gray shadow-sm">
        Niciun client activ la acest curs în luna curentă.
      </p>
    )
  }
  const showReinscriere = pretLunarPromo != null
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-quasar-gray">
          <tr>
            <th className="w-10 px-3 py-2 text-right">#</th>
            <th className="px-3 py-2">Nume</th>
            <th className="px-3 py-2">Ultima prezență</th>
            <th className="px-3 py-2 text-right">Preț înrolare</th>
            {showReinscriere && (
              <th className="px-3 py-2 text-right">
                Reînscriere {pretLunarPromo} RON
              </th>
            )}
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
              <td className="px-3 py-2 text-right text-quasar-black">
                {r.pretInrolare != null ? `${r.pretInrolare} RON` : '—'}
              </td>
              {showReinscriere && (
                <td className="px-3 py-2 text-right">
                  {r.reinscriereActivata ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ Activat
                    </span>
                  ) : !r.areInrolariViitoare ? (
                    <span className="text-xs text-quasar-gray">—</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onActivateReinscriere(r.clientId)
                      }}
                      disabled={activatingClientId === r.clientId}
                      className="rounded-full bg-purple-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
                    >
                      {activatingClientId === r.clientId ? '…' : 'Activează!'}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
