import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PageHeader, Tabs, Badge, Button, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { EvaluariListPage } from './EvaluariListPage'
import { SesiuniTab } from './sesiuni/SesiuniTab'
import { VerificareTab } from './verificare/VerificareTab'
import { EvaluariCountdown } from './components/EvaluariCountdown'
import { getCountdownTeacher } from './flowApi'

export function EvaluariPage() {
  const { role } = useAuth()
  const { teacherId } = useCurrentTeacherId()
  const managerPlus = isManagerOrHigher(role)
  const arePredare = Boolean(teacherId) || role === 'teacher'

  const tabs = [
    ...(arePredare ? [{ id: 'mele', label: 'De completat' }] : []),
    ...(managerPlus
      ? [
          { id: 'verificare', label: 'Verificare' },
          { id: 'runde', label: 'Runde' },
        ]
      : []),
    { id: 'toate', label: 'Toate evaluările' },
  ]

  const [tab, setTab] = useState(tabs[0]?.id ?? 'toate')

  return (
    <div>
      <PageHeader title="Evaluări" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'mele' && <TabDeCompletat />}
      {tab === 'verificare' && <VerificareTab />}
      {tab === 'runde' && <SesiuniTab />}
      {tab === 'toate' && <EvaluariListPage embedded />}
    </div>
  )
}

/** Ce are instructorul de făcut acum: contorul + grupele lui, cu progresul fiecăreia. */
function TabDeCompletat() {
  const { data, isLoading } = useQuery({
    queryKey: ['evaluari', 'countdown'],
    queryFn: getCountdownTeacher,
  })

  if (isLoading) return <Spinner />

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-2">
        Nicio rundă de evaluare deschisă pentru grupele tale. Când managerul deschide
        una, apare aici și primești notificare.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <EvaluariCountdown />

      <div className="space-y-2">
        {data.map((g) => {
          const ramase = Math.max(0, g.n_asteptati - g.n_completate)
          const gata = ramase === 0 && g.n_respinse === 0
          return (
            <div
              key={g.curs_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{g.curs_nume}</p>
                <p className="text-xs text-muted-2">
                  {g.n_completate} din {g.n_asteptati} completați
                  {g.n_respinse > 0 && ` · ${g.n_respinse} întoarse de manager`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {gata ? (
                  <Badge tone="success">
                    {g.grupa_trimisa ? '✓ trimisă la verificare' : '✓ complet'}
                  </Badge>
                ) : (
                  <Badge tone={g.n_respinse > 0 ? 'danger' : 'warn'}>
                    {g.n_respinse > 0 ? `${g.n_respinse} de corectat` : `${ramase} rămași`}
                  </Badge>
                )}
                <Link to={`/evaluari/grupa/${g.curs_id}`}>
                  <Button variant={gata ? 'ghost' : 'secondary'}>
                    {gata ? 'Vezi' : 'Completează'}
                  </Button>
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
