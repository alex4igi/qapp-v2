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
} from '@/features/dashboard/api'
import { CircleCourseCard } from '@/features/dashboard/CircleCourseCard'
import { DashboardChart } from '@/features/dashboard/DashboardChart'
import { DatorniciWorklistCard } from '@/features/dashboard/DatorniciWorklistCard'

function KpiBand({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-violet-700 px-4 py-3 text-center text-white shadow-sm">
      <div className="text-sm font-medium tracking-wide">
        {label}: <span className="font-bold">{value}</span>
      </div>
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
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiBand
            label="Încasări azi"
            value={kpisQ.data ? formatRON(kpisQ.data.incasariAzi) : '—'}
          />
          <KpiBand
            label="Total restanțe"
            value={kpisQ.data ? formatRON(kpisQ.data.restanteTotale) : '—'}
          />
          <KpiBand
            label="Programări azi"
            value={kpisQ.data ? String(kpisQ.data.programariAzi) : '—'}
          />
        </div>
      )}

      {!teacherMode && <DatorniciWorklistCard locatieId={locatieId ?? null} />}

      {coursesQ.isLoading || (teacherMode && teacherCursuriQ.isLoading) ? (
        <Spinner />
      ) : coursesQ.isError ? (
        <p className="text-sm text-red-600">Eroare la încărcarea cursurilor.</p>
      ) : (coursesQ.data ?? []).length === 0 ? (
        <p className="rounded-lg border border-quasar-gray-light bg-white p-6 text-center text-sm text-quasar-gray">
          {teacherMode
            ? 'Nicio grupă a ta programată azi.'
            : `Niciun curs programat în ziua selectată${salaId ? ' pentru această sală' : ''}.`}
        </p>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
          <h2 className="mb-2 text-sm font-semibold text-quasar-black">
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
