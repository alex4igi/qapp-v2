import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { listInchirieriWeek, renterLabel } from '../api/occupancy'
import { todayIso } from '../week'

type Props = {
  locatieId: string | null
  onRental: (id: string) => void
}

// Închirierile de AZI (toate sălile locației) — verificare rapidă la recepție.
export function TodayPanel({ locatieId, onRental }: Props) {
  const today = todayIso()
  const q = useQuery({
    queryKey: ['inchirieri', 'week', locatieId, today, 'today'],
    queryFn: () => listInchirieriWeek({ fromIso: today, toIso: today, locatieId }),
    enabled: Boolean(locatieId),
  })

  const rows = (q.data ?? []).slice().sort((a, b) => a.ora_start.localeCompare(b.ora_start))

  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <h2 className="mb-2 text-sm font-bold text-ink">Închirierile de azi</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nicio închiriere azi.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const gratis = !r.pret || Number(r.pret) === 0
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onRental(r.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface"
                >
                  <span className="font-semibold text-ink">{r.ora_start.slice(0, 5)}</span>
                  <span className="text-muted-2">{renterLabel(r)}</span>
                  <span
                    className={[
                      'ml-auto text-xs',
                      r.status_plata === 'achitat'
                        ? 'text-emerald-600'
                        : 'text-danger',
                    ].join(' ')}
                  >
                    {gratis
                      ? 'gratis'
                      : r.status_plata === 'achitat'
                        ? formatRON(r.pret ?? 0)
                        : `neachitat ${formatRON(r.pret ?? 0)}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
