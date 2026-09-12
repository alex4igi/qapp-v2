import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { saliWithLocatie } from '@/lib/lookups'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { listInchirieriWeek, renterLabel } from '@/features/inchirieri/api/occupancy'

type Props = {
  locatieId: string | null
  salaId?: string
}

// Închirierile de săli private din ziua selectată — informativ, fără roster.
// Intenționat discret (după grupe): recepția vede la ce oră e ocupată sala,
// ca o rezervare creată azi să nu o ia prin surprindere.
export function InchirieriAziCard({ locatieId, salaId }: Props) {
  const { date, isToday } = useWorkingDate()
  const { ready: locatieReady } = useWorkingLocatie()

  const q = useQuery({
    queryKey: ['inchirieri', 'week', locatieId, date, 'dashboard'],
    queryFn: () => listInchirieriWeek({ fromIso: date, toIso: date, locatieId }),
    enabled: locatieReady,
  })
  const saliQ = useQuery({ queryKey: ['lookup', 'sali-nume'], queryFn: saliWithLocatie })

  const salaNume = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of saliQ.data ?? []) m.set(s.id, s.nume)
    return m
  }, [saliQ.data])

  const rows = useMemo(() => {
    let list = q.data ?? []
    if (salaId) list = list.filter((r) => r.sala === salaId)
    return list.slice().sort((a, b) => a.ora_start.localeCompare(b.ora_start))
  }, [q.data, salaId])

  if (rows.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-muted">
        <span>Închirieri săli private {isToday ? 'azi' : 'în ziua selectată'}</span>
        <span className="fnum rounded-full bg-line-2 px-1.5 py-0.5 text-[11px] font-bold text-muted-2">
          {rows.length}
        </span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-card">
        {rows.map((r) => {
          const gratis = !r.pret || Number(r.pret) === 0
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
            >
              <span className="fnum font-display font-semibold text-ink">
                {r.ora_start.slice(0, 5)}–{r.ora_final.slice(0, 5)}
              </span>
              <span className="truncate text-muted-2">
                {salaNume.get(r.sala) ?? '—'}
              </span>
              <span className="truncate text-muted">· {renterLabel(r)}</span>
              <span
                className={[
                  'ml-auto shrink-0 text-[12px]',
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}
