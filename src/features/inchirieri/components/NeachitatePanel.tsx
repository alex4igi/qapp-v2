import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { listInchirieriNeachitate } from '../api/occupancy'

type Props = {
  locatieId: string | null
  onRental: (id: string) => void
}

const fmtData = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

// Worklist de recuperare: toate închirierile cu sold rămas (nu doar cele de azi).
// Click pe un rând → modalul de închiriere, de unde se încasează restul.
export function NeachitatePanel({ locatieId, onRental }: Props) {
  const q = useQuery({
    queryKey: ['inchirieri', 'neachitate', locatieId],
    queryFn: () => listInchirieriNeachitate({ locatieId }),
    enabled: Boolean(locatieId),
  })
  const rows = q.data ?? []
  const total = rows.reduce((s, r) => s + r.rest, 0)

  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <h2 className="mb-2 flex items-center justify-between text-sm font-bold text-ink">
        <span>Închirieri neachitate</span>
        {rows.length > 0 && (
          <span className="text-danger">{formatRON(total)}</span>
        )}
      </h2>
      {q.isLoading ? (
        <p className="text-sm text-muted">Se încarcă…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Toate închirierile sunt achitate.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onRental(r.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface"
              >
                <span className="shrink-0 font-semibold text-ink">{fmtData(r.data)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-2">
                  {r.renter}
                  {r.sala_nume ? ` · ${r.sala_nume}` : ''}
                </span>
                <span className="ml-auto shrink-0 text-xs text-danger">
                  {formatRON(r.rest)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
