import { Badge } from '@/components/ui'
import { formatRON } from '@/lib/format'
import type { LinieEliminatorie } from './types'

function detaliuCasa(e: LinieEliminatorie): string | null {
  if (e.cheie !== 'diferente_casa') return null
  const d = (e.detalii ?? {}) as Record<string, unknown>
  const zile = Number(d.zile_reconciliate ?? 0)
  const cuDif = Number(d.zile_cu_diferenta ?? 0)
  if (zile === 0) return 'Nicio zi reconciliată în lună — n-avem ce compara.'
  if (cuDif === 0) return `${zile} zile reconciliate, toate la zero.`
  return `${cuDif} din ${zile} zile cu diferență, cumulat ${formatRON(Number(d.suma_diferentelor ?? 0))}.`
}

export function EliminatoriiCard({
  eliminatorii,
  picat,
}: {
  eliminatorii: LinieEliminatorie[]
  picat: boolean
}) {
  if (eliminatorii.length === 0) return null

  return (
    <div
      className={`rounded-xl border p-4 ${
        picat ? 'border-danger/40 bg-danger-bg' : 'border-line bg-card'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold text-ink">Eliminatorii</h3>
        {picat ? (
          <Badge tone="danger">bonusul lunii se pierde</Badge>
        ) : (
          <Badge tone="success">toate trecute</Badge>
        )}
      </div>

      <ul className="space-y-2">
        {eliminatorii.map((e) => {
          const extra = detaliuCasa(e)
          return (
            <li key={e.kpi_id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  {e.denumire}
                  {e.sursa === 'auto' && (
                    <span className="ml-2 text-xs font-normal text-muted">(automat)</span>
                  )}
                </div>
                {extra && <div className="text-xs text-muted">{extra}</div>}
                {e.indeplinit === false && e.conditie && (
                  <div className="text-xs text-danger">{e.conditie}</div>
                )}
              </div>
              <Badge
                tone={e.indeplinit == null ? 'warn' : e.indeplinit ? 'success' : 'danger'}
              >
                {e.indeplinit == null ? 'necompletat' : e.indeplinit ? 'OK' : 'picat'}
              </Badge>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
