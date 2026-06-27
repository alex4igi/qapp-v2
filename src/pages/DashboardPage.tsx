import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Select, Spinner } from '@/components/ui'
import { saliOptions, cursuriOptionsForCurrentTeacher } from '@/lib/lookups'
import { formatRON } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isTeacher } from '@/lib/rolesMatrix'
import {
  getDashboardKpis,
  getDashboardCourses,
  getDashboardChart,
  getDashboardEvents,
} from '@/features/dashboard/api'
import { CircleCourseCard } from '@/features/dashboard/CircleCourseCard'
import { EventDashboardCard } from '@/features/dashboard/EventDashboardCard'
import { DashboardChart } from '@/features/dashboard/DashboardChart'
import { DatorniciWorklistCard } from '@/features/dashboard/DatorniciWorklistCard'
import { AgendaAziCard } from '@/features/dashboard/AgendaAziCard'

function KpiCard({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: string
  label: string
  value: string
  hint?: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        highlight ? 'border-quasar-yellow ring-1 ring-quasar-yellow' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-quasar-yellow text-xl">
          {icon}
        </div>
        <span className="text-sm font-medium text-quasar-gray">{label}</span>
      </div>
      <div className="mt-3 font-display text-3xl font-bold text-quasar-black">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-quasar-gray">{hint}</div> : null}
    </div>
  )
}

export function DashboardPage() {
  const { role } = useAuth()
  const teacherMode = isTeacher(role)
  const { date } = useWorkingDate()
  const { locatieId } = useWorkingLocatie()
  const [params, setParams] = useSearchParams()

  const salaId = params.get('sala') ?? ''

  const updateSala = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('sala', value)
    else next.delete('sala')
    setParams(next, { replace: true })
  }

  // Pentru teacher: lista de curs IDs asociate via cursuri_teacheri M:N
  const teacherCursuriQ = useQuery({
    queryKey: ['lookup', 'cursuri', 'teacher'],
    queryFn: cursuriOptionsForCurrentTeacher,
    enabled: teacherMode,
  })
  const teacherCursIds = teacherMode
    ? (teacherCursuriQ.data ?? []).map((o) => o.value)
    : null

  const saliQ = useQuery({
    queryKey: ['lookup', 'sali', locatieId ?? 'all'],
    queryFn: () => saliOptions(locatieId),
    enabled: !teacherMode,
  })

  // KPI-uri financiare doar pentru staff
  const kpisQ = useQuery({
    queryKey: ['dashboard', 'kpis', date],
    queryFn: () => getDashboardKpis(date),
    enabled: !teacherMode,
  })

  // Evenimentele zilei — staff-facing (ca KPI-urile), nu pentru teacher.
  const eventsQ = useQuery({
    queryKey: ['dashboard', 'events', date],
    queryFn: () => getDashboardEvents(date),
    enabled: !teacherMode,
  })

  const coursesQ = useQuery({
    queryKey: [
      'dashboard',
      'courses',
      date,
      salaId,
      locatieId ?? 'all',
      teacherCursIds,
    ],
    queryFn: () =>
      getDashboardCourses({
        date,
        salaId: salaId || null,
        locatieId: locatieId ?? null,
        cursIds: teacherCursIds,
      }),
    enabled: !teacherMode || teacherCursuriQ.isSuccess,
  })

  const courseRefs = useMemo(
    () =>
      (coursesQ.data ?? []).map((c) => ({ id: c.id, numele: c.numele })),
    [coursesQ.data],
  )

  // Chart doar pentru staff
  const chartQ = useQuery({
    queryKey: ['dashboard', 'chart', courseRefs.map((c) => c.id).join(',')],
    queryFn: () => getDashboardChart(courseRefs),
    enabled: !teacherMode && courseRefs.length > 0,
  })

  return (
    <div>
      <PageHeader
        title={teacherMode ? 'Grupele mele azi' : 'Dashboard'}
        subtitle={
          teacherMode
            ? 'Click pe o grupă pentru a marca prezența cursanților'
            : undefined
        }
        actions={
          !teacherMode && (saliQ.data ?? []).length > 1 ? (
            <div className="w-40">
              <Select
                placeholder="Toate sălile"
                options={saliQ.data ?? []}
                value={salaId}
                onChange={(e) => updateSala(e.target.value)}
              />
            </div>
          ) : null
        }
      />

      {!teacherMode && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            icon="💰"
            label="Încasări azi"
            value={kpisQ.data ? formatRON(kpisQ.data.incasariAzi) : '—'}
            highlight
          />
          <KpiCard
            icon="⚠️"
            label="Restanțe de recuperat"
            value={kpisQ.data ? formatRON(kpisQ.data.restanteNet) : '—'}
            hint={
              kpisQ.data && kpisQ.data.restantePrescris > 0
                ? `+ ${formatRON(kpisQ.data.restantePrescris)} prescrise (> 2 ani)`
                : undefined
            }
          />
          <KpiCard
            icon="📅"
            label="Programări azi"
            value={kpisQ.data ? String(kpisQ.data.programariAzi) : '—'}
          />
        </div>
      )}

      {!teacherMode && <AgendaAziCard />}

      {!teacherMode && <DatorniciWorklistCard locatieId={locatieId ?? null} />}

      {!teacherMode && (eventsQ.data ?? []).length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-quasar-black">
            Evenimente azi
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {eventsQ.data!.map((e) => (
              <EventDashboardCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}

      {coursesQ.isLoading || (teacherMode && teacherCursuriQ.isLoading) ? (
        <Spinner />
      ) : coursesQ.isError ? (
        <p className="text-sm text-red-600">Eroare la încărcarea cursurilor.</p>
      ) : (coursesQ.data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-center text-sm text-muted">
          {teacherMode
            ? 'Nicio grupă a ta programată azi.'
            : `Niciun curs programat în ziua selectată${salaId ? ' pentru această sală' : ''}.`}
        </p>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {coursesQ.data!.map((c) => (
            <CircleCourseCard
              key={c.id}
              cursId={c.id}
              numele={c.numele}
              ora={c.ora}
              sala={c.sala}
              teacher={c.teacher}
              prezenti={c.prezenti}
              enrolled={c.enrolled}
              to={`/grupa/${c.id}${salaId ? `?sala=${salaId}` : ''}`}
            />
          ))}
        </div>
      )}

      {!teacherMode && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-ink">
            Încasări vs Restanțe (cursurile zilei)
          </h2>
          {chartQ.isLoading ? (
            <Spinner />
          ) : (
            <DashboardChart rows={chartQ.data ?? []} />
          )}
        </>
      )}
    </div>
  )
}
