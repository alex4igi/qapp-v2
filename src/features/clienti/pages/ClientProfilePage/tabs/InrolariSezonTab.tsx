import { Button, Spinner } from '@/components/ui'
import type { ClientInrolareSezon } from '../../../api'
import { formatLuna } from '../helpers'

type Props = {
  loading: boolean
  rows: ClientInrolareSezon[]
  cursuri: { id: string; nume: string }[]
  reziliereByCurs: Map<string, number>
  onAskRezilia: (id: string) => void
  onAdjustPrice?: (enrollmentId: string) => void
  onMoveCurs?: (enrollmentId: string) => void
  onMotiveaza?: (enrollmentId: string) => void
}

export function InrolariSezonTab({
  loading,
  rows,
  cursuri,
  reziliereByCurs,
  onAskRezilia,
  onAdjustPrice,
  onMoveCurs,
  onMotiveaza,
}: Props) {
  if (loading) return <Spinner />
  if (rows.length === 0) {
    return <p className="text-sm text-quasar-gray">Nicio înrolare în acest sezon.</p>
  }

  const byCurs = new Map<string, ClientInrolareSezon[]>()
  for (const r of rows) {
    const arr = byCurs.get(r.id_curs) ?? []
    arr.push(r)
    byCurs.set(r.id_curs, arr)
  }

  return (
    <div className="space-y-6">
      {cursuri.map((c) => {
        const list = byCurs.get(c.id) ?? []
        const reziliereCount = reziliereByCurs.get(c.id) ?? 0
        return (
          <div
            key={c.id}
            className="rounded-lg border border-quasar-gray-light bg-white"
          >
            <div className="flex items-center justify-between border-b border-quasar-gray-light px-4 py-2">
              <h3 className="text-sm font-bold text-quasar-black">{c.nume}</h3>
              {reziliereCount > 0 && (
                <Button variant="ghost" onClick={() => onAskRezilia(c.id)}>
                  Reziliază
                </Button>
              )}
            </div>
            <ul className="divide-y divide-quasar-gray-light">
              {list.map((r) => {
                const rest = r.rest ?? 0
                const total = r.total_de_plata ?? 0
                const achitat = rest <= 0
                return (
                  <li
                    key={r.id_enrollment}
                    className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                  >
                    <span className="w-1/3 text-quasar-black">
                      {formatLuna(r.data_incepere)}
                    </span>
                    <span className="w-1/4 text-quasar-gray">
                      {r.tip_plata ?? '—'}
                    </span>
                    <span className="flex-1 text-right">
                      {achitat ? (
                        <span className="text-emerald-700">
                          ✓ Achitat ({total} RON)
                        </span>
                      ) : (
                        <span className="rounded-md bg-red-100 px-2 py-1 text-red-700">
                          {rest} RON rest
                        </span>
                      )}
                    </span>
                    {onAdjustPrice && (
                      <Button
                        variant="ghost"
                        onClick={() => onAdjustPrice(r.id_enrollment)}
                        title="Ajustează prețul înrolării (cu motiv + audit)"
                      >
                        💰 Ajustează
                      </Button>
                    )}
                    {onMoveCurs && (
                      <Button
                        variant="ghost"
                        onClick={() => onMoveCurs(r.id_enrollment)}
                        title="Mută înrolarea la alt curs (păstrează plata)"
                      >
                        📦 Mută
                      </Button>
                    )}
                    {onMotiveaza && (
                      <Button
                        variant="ghost"
                        onClick={() => onMotiveaza(r.id_enrollment)}
                        title="Motivează absențele lunii (adeverință medicală → eventual scutire)"
                      >
                        🩺 Motivează
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
