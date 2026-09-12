import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { sezonActiv } from '@/lib/lookups'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { getRestanteWorklist, type WorklistRow } from '@/features/datorii/api'
import {
  LogRecuperareModal,
  type RecuperareTarget,
} from '@/features/datorii/LogRecuperareModal'

const TOP = 8

// Card „de sunat azi" pe dashboard — apare DOAR când există datornici activi cu
// cel puțin o rată chiar depășită (worklist), filtrat pe locația de lucru și
// sezonul activ (aliniat cu compozitorul SMS — nu sunăm pentru sezoane vechi).
// Front-desk (și restul staff-ului) acționează direct din locul unde aterizează.
export function DatorniciWorklistCard({
  locatieId,
}: {
  locatieId: string | null
}) {
  const [target, setTarget] = useState<RecuperareTarget | null>(null)
  const [expanded, setExpanded] = useState(false)

  const { ready: locatieReady } = useWorkingLocatie()
  // Același query de sezon ca restul dashboard-ului (o singură cerere, cache comun).
  const sezonActivQ = useQuery({
    queryKey: ['lookup', 'sezon-activ-detalii'],
    queryFn: sezonActiv,
  })
  const sezonId = sezonActivQ.data?.id ?? null

  const worklistQ = useQuery({
    queryKey: ['restante-worklist', locatieId ?? 'all', sezonId ?? 'all'],
    queryFn: () => getRestanteWorklist(locatieId, sezonId),
    enabled: sezonActivQ.isSuccess && locatieReady,
  })

  const rows = worklistQ.data ?? []
  if (rows.length === 0) return null // nu afișăm nimic când nu sunt datornici

  const top = rows.slice(0, TOP)

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-danger/30 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <span
            className={`text-xs text-red-700 transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <h2 className="text-sm font-semibold text-red-800">
            📞 Datornici de sunat ({rows.length})
          </h2>
        </button>
        <Link
          to="/datorii"
          className="shrink-0 text-xs font-medium text-red-700 hover:underline"
        >
          Vezi toți →
        </Link>
      </div>
      {expanded && (
      <ul className="divide-y divide-quasar-gray-light">
        {top.map((r: WorklistRow) => (
          <li
            key={r.client_id}
            className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <Link
              to={`/clienti/${r.client_id}`}
              className="min-w-0 flex-1 truncate font-medium text-ink hover:underline"
            >
              {r.nume} {r.prenume ?? ''}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              {r.nr_rate_neachitate} rate
              {r.zile_depasire != null && (
                <>
                  {' · '}
                  <span
                    className={
                      r.zile_depasire > 50
                        ? 'font-semibold text-red-600'
                        : r.zile_depasire > 14
                          ? 'font-medium text-amber-600'
                          : ''
                    }
                    title={
                      r.zile_depasire > 50
                        ? 'Risc de pierdere a locului în grupă (>50 zile)'
                        : undefined
                    }
                  >
                    {r.zile_depasire > 50 && '🚨 '}
                    {r.zile_depasire}z
                  </span>
                </>
              )}
            </span>
            <span className="w-24 shrink-0 text-right font-semibold text-red-600">
              {formatRON(r.rest_total)}
            </span>
            <button
              type="button"
              onClick={() =>
                setTarget({
                  clientId: r.client_id,
                  nume: `${r.nume} ${r.prenume ?? ''}`.trim(),
                  rest: r.rest_total,
                })
              }
              className="shrink-0 rounded-md border border-line px-2 py-1 text-xs text-muted-2 transition-colors hover:border-quasar-yellow hover:text-ink"
              title="Loghează apel de recuperare"
            >
              📞
            </button>
          </li>
        ))}
      </ul>
      )}

      {target && (
        <LogRecuperareModal
          open
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  )
}
