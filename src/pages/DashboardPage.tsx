import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Select, Spinner } from '@/components/ui'
import { saliOptions, cursuriOptionsForCurrentTeacher } from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingDate } from '@/hooks/useWorkingDate'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isTeacher } from '@/lib/rolesMatrix'
import {
  getDashboardCourses,
  getDashboardChart,
  getDashboardEvents,
} from '@/features/dashboard/api'
import { DailyAgenda } from '@/features/dashboard/DailyAgenda'
import { DashboardKpis } from '@/features/dashboard/DashboardKpis'
import { EventDashboardCard } from '@/features/dashboard/EventDashboardCard'
import { DashboardChart } from '@/features/dashboard/DashboardChart'
import { DatorniciWorklistCard } from '@/features/dashboard/DatorniciWorklistCard'
import { AgendaAziCard } from '@/features/dashboard/AgendaAziCard'
import { InchirieriAziCard } from '@/features/dashboard/InchirieriAziCard'

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

  // Chart doar pentru staff — pe luna curentă (YYYY-MM)
  const lunaCurenta = date.slice(0, 7)
  const chartQ = useQuery({
    queryKey: [
      'dashboard',
      'chart',
      lunaCurenta,
      courseRefs.map((c) => c.id).join(','),
    ],
    queryFn: () => getDashboardChart(courseRefs, lunaCurenta),
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

      {!teacherMode && <DashboardKpis date={date} courses={courseRefs} />}

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

      <DailyAgenda
        courses={coursesQ.data ?? []}
        loading={coursesQ.isLoading || (teacherMode && teacherCursuriQ.isLoading)}
        isError={coursesQ.isError}
        salaId={salaId}
        emptyMessage={
          teacherMode
            ? 'Nicio grupă a ta programată azi.'
            : `Niciun curs programat în ziua selectată${salaId ? ' pentru această sală' : ''}.`
        }
      />

      {!teacherMode && (
        <InchirieriAziCard locatieId={locatieId ?? null} salaId={salaId} />
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
