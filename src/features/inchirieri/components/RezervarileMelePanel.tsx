import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { listInchirieriByTeacher } from '../api/occupancy'
import { todayIso } from '../week'

type Props = {
  onRental: (id: string) => void
}

const fmtData = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

// Panoul teacherului pe /inchirieri: propriile rezervări din ultima săptămână +
// viitoare. Înlocuiește panourile financiare de recepție (Azi / Neachitate),
// pe care teacherul nu le vede.
export function RezervarileMelePanel({ onRental }: Props) {
  const { teacherId, loading } = useCurrentTeacherId()

  const fromIso = (() => {
    const d = new Date(`${todayIso()}T00:00:00`)
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })()

  const q = useQuery({
    queryKey: ['inchirieri', 'mele', teacherId, fromIso],
    queryFn: () => listInchirieriByTeacher(teacherId!, fromIso),
    enabled: Boolean(teacherId),
  })
  const rows = q.data ?? []

  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <h2 className="mb-2 text-sm font-bold text-ink">Rezervările mele</h2>
      {loading || q.isLoading ? (
        <p className="text-sm text-muted">Se încarcă…</p>
      ) : !teacherId ? (
        <p className="text-sm text-muted">
          Contul tău nu e legat de un profil de instructor — cere unui manager să
          facă legătura.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nicio rezervare recentă.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {rows.map((r) => {
            const gratis = !r.pret || Number(r.pret) === 0
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onRental(r.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface"
                >
                  <span className="shrink-0 font-semibold text-ink">
                    {fmtData(r.data)} {r.ora_start.slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-2">
                    {r.sala_nume ?? '—'}
                  </span>
                  <span
                    className={[
                      'ml-auto shrink-0 text-xs',
                      gratis
                        ? 'text-muted'
                        : r.status_plata === 'achitat'
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
