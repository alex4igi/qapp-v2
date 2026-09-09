import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Spinner, Badge } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { listSezoane } from '@/features/plati/api'
import {
  getDashboardKpis,
  getIncasariAzi,
  getProgramariAzi,
  getRestantieriAzi,
} from './api'

type Panel = 'incasari' | 'programari' | 'restante'

function KpiCard({
  icon,
  label,
  value,
  active,
  onClick,
  className,
}: {
  icon: string
  label: string
  value: string
  active: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex flex-col rounded-2xl border bg-card p-5 text-left transition-shadow hover:shadow-md max-md:p-3.5',
        active ? 'border-quasar-yellow ring-1 ring-quasar-yellow' : 'border-line',
        className ?? '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 max-md:gap-2">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-quasar-yellow text-xl max-md:h-8 max-md:w-8 max-md:text-sm">
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-muted max-md:text-[12px] max-md:leading-tight">
          {label}
        </span>
        <span
          className={[
            'text-[11px] text-muted transition-transform',
            active ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        >
          ▾
        </span>
      </div>
      <div className="fnum mt-3 font-display text-3xl font-bold text-ink max-md:mt-2 max-md:text-xl">
        {value}
      </div>
    </button>
  )
}

function PreviewShell({
  title,
  loading,
  empty,
  children,
}: {
  title: string
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <div className="mt-3 rounded-2xl border border-line bg-card p-4">
      <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </div>
      {loading ? (
        <div className="py-4">
          <Spinner />
        </div>
      ) : empty ? (
        <div className="px-1 py-3 text-sm text-muted">Nimic de afișat.</div>
      ) : (
        <div className="flex flex-col">{children}</div>
      )}
    </div>
  )
}

const rowCls =
  'flex items-center gap-3 border-t border-line-2 px-1 py-2 text-sm first:border-t-0'

const CAP = 8

export function DashboardKpis({
  date,
  courses,
}: {
  date: string
  courses: { id: string; numele: string }[]
}) {
  const [open, setOpen] = useState<Panel | null>(null)
  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p))

  const { locatieId } = useWorkingLocatie()

  const kpisQ = useQuery({
    queryKey: ['dashboard', 'kpis', date, locatieId ?? 'all'],
    queryFn: () => getDashboardKpis(date, locatieId),
  })

  const sezoaneQ = useQuery({ queryKey: ['sezoane-list'], queryFn: listSezoane })
  const sezon = useMemo(() => {
    const list = sezoaneQ.data ?? []
    if (!list.length) return null
    const today = new Date().toISOString().slice(0, 10)
    return (
      list.find(
        (s) =>
          s.data_incepere &&
          s.data_final &&
          s.data_incepere <= today &&
          today <= s.data_final,
      ) ?? list[0]
    )
  }, [sezoaneQ.data])

  const courseIds = courses.map((c) => c.id).join(',')

  // Restanțierii pe grupele de azi — eager (dă și totalul KPI), refolosit la preview.
  const restanteQ = useQuery({
    queryKey: ['preview', 'restante', date, courseIds, sezon?.id],
    queryFn: () =>
      getRestantieriAzi(courses, sezon!.data_incepere!, sezon!.data_final!),
    enabled: Boolean(sezon?.data_incepere && sezon?.data_final) && courses.length > 0,
  })
  const restanteTotal = (restanteQ.data ?? []).reduce((a, r) => a + r.rest, 0)

  const incasariQ = useQuery({
    queryKey: ['preview', 'incasari', date, locatieId ?? 'all'],
    queryFn: () => getIncasariAzi(date, locatieId),
    enabled: open === 'incasari',
  })
  const programariQ = useQuery({
    queryKey: ['preview', 'programari', date, locatieId ?? 'all'],
    queryFn: () => getProgramariAzi(date, locatieId),
    enabled: open === 'programari',
  })

  const more = (n: number) =>
    n > CAP ? (
      <div className="px-1 pt-2 text-xs text-muted">și încă {n - CAP}…</div>
    ) : null

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-4 max-md:gap-2.5 md:grid-cols-3">
        <KpiCard
          icon="💰"
          label="Încasări azi"
          value={kpisQ.data ? formatRON(kpisQ.data.incasariAzi) : '—'}
          active={open === 'incasari'}
          onClick={() => toggle('incasari')}
        />
        <KpiCard
          icon="📅"
          label="Programări azi"
          value={kpisQ.data ? String(kpisQ.data.programariAzi) : '—'}
          active={open === 'programari'}
          onClick={() => toggle('programari')}
        />
        <KpiCard
          className="max-md:col-span-2"
          icon="⚠️"
          label="Restanțieri azi"
          value={restanteQ.isLoading ? '…' : formatRON(restanteTotal)}
          active={open === 'restante'}
          onClick={() => toggle('restante')}
        />
      </div>

      {open === 'incasari' && (
        <PreviewShell
          title="Plăți de azi · cine · cât · cum"
          loading={incasariQ.isLoading}
          empty={(incasariQ.data ?? []).length === 0}
        >
          {(incasariQ.data ?? []).slice(0, CAP).map((r) => (
            <div key={r.id} className={rowCls}>
              <span className="flex-1 truncate font-medium text-ink">{r.nume}</span>
              {r.metoda && <Badge tone="neutral">{r.metoda}</Badge>}
              <span className="fnum w-24 text-right font-semibold text-ink">
                {formatRON(r.suma)}
              </span>
            </div>
          ))}
          {more((incasariQ.data ?? []).length)}
        </PreviewShell>
      )}

      {open === 'programari' && (
        <PreviewShell
          title="Programări de azi · cine · grupă"
          loading={programariQ.isLoading}
          empty={(programariQ.data ?? []).length === 0}
        >
          {(programariQ.data ?? []).slice(0, CAP).map((r) => (
            <div key={r.id} className={rowCls}>
              <span className="flex-1 truncate font-medium text-ink">{r.nume}</span>
              <span className="truncate text-muted-2">{r.grupa}</span>
            </div>
          ))}
          {more((programariQ.data ?? []).length)}
        </PreviewShell>
      )}

      {open === 'restante' && (
        <PreviewShell
          title="Restanțieri pe grupele de azi · cine · grupă · cât"
          loading={restanteQ.isLoading}
          empty={(restanteQ.data ?? []).length === 0}
        >
          {(restanteQ.data ?? []).slice(0, CAP).map((r) => (
            <div key={`${r.clientId}-${r.grupa}`} className={rowCls}>
              <span className="flex-1 truncate font-medium text-ink">{r.nume}</span>
              <span className="truncate text-muted-2">{r.grupa}</span>
              <span className="fnum w-24 text-right font-bold text-danger">
                {formatRON(r.rest)}
              </span>
            </div>
          ))}
          {more((restanteQ.data ?? []).length)}
        </PreviewShell>
      )}
    </div>
  )
}
