import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import {
  isAdminOrHigher,
  isManagerOrHigher,
  isTeacher,
} from '@/lib/rolesMatrix'
import { KpiCard } from '@/features/statistici/KpiCard'
import {
  getClientiActivi,
  getTrendPrezente,
  getCrestereNeta,
  getGradOcupare,
  getConversieLeads,
  getProfitabilitateTeacher,
} from './api'
import { TrendPrezenteSection } from './TrendPrezenteSection'
import { ClientiActiviPieChart } from './ClientiActiviPieChart'
import { TotalClientiChart } from './TotalClientiChart'
import { OcupareList } from './OcupareList'
import { TeacherMarjaTable } from './TeacherMarjaTable'

export function AnsambluPage() {
  const { role } = useAuth()
  const { locatieId, locatieNume } = useWorkingLocatie()
  const teacher = isTeacher(role)
  const privileged = isManagerOrHigher(role)
  // Teacher: RPC-urile se auto-restrâng la cursurile lui (nu filtrăm pe locație).
  const scopLocatie = teacher ? null : locatieId

  const activiQ = useQuery({
    queryKey: ['ansamblu', 'clienti-activi'],
    queryFn: getClientiActivi,
    enabled: !teacher,
  })
  const trendQ = useQuery({
    queryKey: ['ansamblu', 'trend', scopLocatie, role],
    queryFn: () => getTrendPrezente(scopLocatie),
  })
  const ocupareQ = useQuery({
    queryKey: ['ansamblu', 'ocupare', scopLocatie, role],
    queryFn: () => getGradOcupare(scopLocatie),
  })
  const crestereQ = useQuery({
    queryKey: ['ansamblu', 'crestere-neta', locatieId],
    queryFn: () => getCrestereNeta(locatieId, 12),
    enabled: !teacher && privileged,
  })
  const conversieQ = useQuery({
    queryKey: ['ansamblu', 'conversie-leads'],
    queryFn: () => getConversieLeads(12),
    enabled: !teacher && privileged,
  })
  const profitQ = useQuery({
    queryKey: ['ansamblu', 'profit-teacher'],
    queryFn: () => getProfitabilitateTeacher(12),
    enabled: isAdminOrHigher(role),
  })

  const { total, perLocatie } = useMemo(() => {
    const rows = activiQ.data ?? []
    return {
      total: rows.find((r) => r.locatie_id === null)?.activi ?? 0,
      perLocatie: rows.filter((r) => r.locatie_id !== null),
    }
  }, [activiQ.data])

  const lucruRow = locatieId
    ? perLocatie.find((r) => r.locatie_id === locatieId) ?? null
    : null
  const scopValue = locatieId ? lucruRow?.activi ?? 0 : total
  const scopLabel = locatieId
    ? `la ${locatieNume ?? 'locația selectată'}`
    : 'unic, pe tot clubul'

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={
          teacher
            ? 'Cursurile tale: ocupare și trendul prezențelor.'
            : 'Client activ = înrolat la curs recurent luna asta, sau prezent în ultimele 21 zile la un curs facultativ.'
        }
      />

      <div className="flex flex-col gap-8">
        {!teacher && (
          <section className="flex flex-col gap-4">
            {activiQ.isLoading ? (
              <Spinner />
            ) : (
              <>
                {/* Cardurile numerice doar pentru front_desk (nu vede donut-ul).
                    Manager+ au numerele în donut → fără redundanță. */}
                {!privileged && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                      label="Clienți activi"
                      value={scopValue}
                      tone="positive"
                      hint={scopLabel}
                    />
                  </div>
                )}

                {privileged && perLocatie.length > 0 && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ClientiActiviPieChart rows={perLocatie} total={total} />
                    <div>
                      <div className="mb-2 flex items-end justify-between gap-3">
                        <h2 className="text-sm font-semibold text-quasar-black">
                          Total clienți (ultimele 12 luni)
                        </h2>
                        <span className="text-xs text-quasar-gray">
                          {locatieId ? locatieNume : 'toate locațiile'}
                        </span>
                      </div>
                      {crestereQ.isLoading ? (
                        <Spinner />
                      ) : (
                        <TotalClientiChart rows={crestereQ.data ?? []} />
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {trendQ.isLoading ? (
          <Spinner />
        ) : (
          <TrendPrezenteSection rows={trendQ.data ?? []} />
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-quasar-black">
            Grad de ocupare cursuri
          </h2>
          <p className="mb-3 text-xs text-quasar-gray">
            Înscriși activi luna asta / capacitate.{' '}
            <span className="text-green-700">verde</span> bine ocupat ·{' '}
            <span className="text-amber-600">galben</span> loc disponibil ·{' '}
            <span className="text-red-600">roșu</span> peste capacitate.
          </p>
          {ocupareQ.isLoading ? (
            <Spinner />
          ) : (
            <OcupareList rows={ocupareQ.data ?? []} />
          )}
        </section>

        {!teacher && privileged && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-quasar-black">
              Conversie lead → client (ultimele 12 luni)
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Lead-uri intrate"
                value={conversieQ.data?.total_leads ?? '—'}
              />
              <KpiCard
                label="Convertiți"
                value={conversieQ.data?.convertiti ?? '—'}
                tone="positive"
              />
              <KpiCard
                label="Rată conversie"
                value={
                  conversieQ.data ? `${conversieQ.data.procent}%` : '—'
                }
                tone="positive"
              />
              <KpiCard
                label="Zile medii până la conversie"
                value={conversieQ.data?.zile_medii ?? '—'}
              />
            </div>
          </section>
        )}

        {isAdminOrHigher(role) && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-quasar-black">
              Profitabilitate instructori (ultimele 12 luni)
            </h2>
            <p className="mb-3 text-xs text-quasar-gray">
              Încasări atribuite cursurilor instructorului minus salariu. Vizibil
              doar pentru owner și admin.
            </p>
            {profitQ.isLoading ? (
              <Spinner />
            ) : (
              <TeacherMarjaTable rows={profitQ.data ?? []} />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
