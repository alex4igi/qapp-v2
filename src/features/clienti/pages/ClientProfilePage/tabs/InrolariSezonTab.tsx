import { Button, KebabMenu, Spinner } from '@/components/ui'
import type { MenuItem } from '@/components/ui'
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
  onConvertToAbonament?: (enrollmentId: string, cursId: string) => void
  onConvertToSedinte?: (enrollmentId: string) => void
  facultativCursIds?: Set<string>
  onDelete?: (row: ClientInrolareSezon) => void
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
  onConvertToAbonament,
  onConvertToSedinte,
  facultativCursIds,
  onDelete,
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
            className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="font-display text-sm font-bold text-quasar-black">{c.nume}</h3>
              {reziliereCount > 0 && (
                <Button variant="ghost" onClick={() => onAskRezilia(c.id)}>
                  Reziliază
                </Button>
              )}
            </div>
            <ul className="divide-y divide-gray-100">
              {list.map((r) => {
                const rest = r.rest ?? 0
                const total = r.total_de_plata ?? 0
                const achitat = rest <= 0
                const actions: MenuItem[] = []
                if (onAdjustPrice)
                  actions.push({
                    icon: '💰',
                    label: 'Ajustează',
                    title: 'Ajustează prețul înrolării (cu motiv + audit)',
                    onClick: () => onAdjustPrice(r.id_enrollment),
                  })
                if (onMoveCurs)
                  actions.push({
                    icon: '📦',
                    label: 'Mută',
                    title: 'Mută înrolarea la alt curs (păstrează plata)',
                    onClick: () => onMoveCurs(r.id_enrollment),
                  })
                if (onMotiveaza)
                  actions.push({
                    icon: '🩺',
                    label: 'Motivează',
                    title:
                      'Motivează absențele lunii (adeverință medicală → eventual scutire)',
                    onClick: () => onMotiveaza(r.id_enrollment),
                  })
                if (onConvertToAbonament && r.tip_plata === 'Per sedinta')
                  actions.push({
                    icon: '🎓',
                    label: 'Abonează',
                    title:
                      'Convertește ședința în abonament (creează abonamentul, ședința rămâne gratuită)',
                    onClick: () => onConvertToAbonament(r.id_enrollment, r.id_curs),
                  })
                if (
                  onConvertToSedinte &&
                  r.tip_plata === 'Per luna' &&
                  facultativCursIds?.has(r.id_curs)
                )
                  actions.push({
                    icon: '🎫',
                    label: 'Treci pe ședințe',
                    title:
                      'Convertește abonamentul în ședințe (încasează doar ședințele prezente; restul rămâne credit)',
                    onClick: () => onConvertToSedinte(r.id_enrollment),
                  })
                if (onDelete)
                  actions.push({
                    icon: '🗑️',
                    label: 'Șterge',
                    title: 'Șterge înrolarea (duplicat creat din greșeală)',
                    danger: true,
                    separatorBefore: true,
                    onClick: () => onDelete(r),
                  })
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Achitat ({total} RON)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Restanță {rest} RON
                        </span>
                      )}
                    </span>
                    <KebabMenu items={actions} ariaLabel="Acțiuni înrolare" />
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
