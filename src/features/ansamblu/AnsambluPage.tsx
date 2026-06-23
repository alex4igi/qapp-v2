import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { KpiCard } from '@/features/statistici/KpiCard'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import {
  getRataPrezentaLuna,
  getOcupareTotala,
  getRetentieLuna,
  getVenitLunaCurenta,
} from '@/features/statistici/api'
import { getClientiActivi } from './api'
import { ClientiActiviPieChart } from './ClientiActiviPieChart'

export function AnsambluPage() {
  const { role } = useAuth()
  const { locatieId, locatieNume } = useWorkingLocatie()
  const privileged = isManagerOrHigher(role)

  const activiQ = useQuery({
    queryKey: ['ansamblu', 'clienti-activi'],
    queryFn: getClientiActivi,
  })
  const venitLunaQ = useQuery({
    queryKey: ['ansamblu', 'venit-luna'],
    queryFn: getVenitLunaCurenta,
  })
  const rataPrezentaQ = useQuery({
    queryKey: ['ansamblu', 'rata-prezenta'],
    queryFn: getRataPrezentaLuna,
  })
  const ocupareTotalaQ = useQuery({
    queryKey: ['ansamblu', 'ocupare-totala'],
    queryFn: getOcupareTotala,
  })
  const retentieQ = useQuery({
    queryKey: ['ansamblu', 'retentie'],
    queryFn: getRetentieLuna,
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

  const venitCard = (
    <KpiCard
      label="Venit luna curentă"
      value={venitLunaQ.data != null ? formatRON(venitLunaQ.data) : '—'}
      tone="positive"
      hint="încasări în luna în curs"
    />
  )

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Client activ = înrolat la curs recurent luna asta, sau prezent în ultimele 21 zile la un curs facultativ."
      />

      <div className="flex flex-col gap-8">
          {/* Clienți activi + venit luna curentă */}
          {activiQ.isLoading ? (
            <Spinner />
          ) : privileged ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {perLocatie.length > 0 ? (
                <ClientiActiviPieChart rows={perLocatie} total={total} />
              ) : (
                <KpiCard
                  label="Clienți activi"
                  value={scopValue}
                  tone="positive"
                  hint={scopLabel}
                />
              )}
              <div className="grid grid-cols-1 gap-3 self-start">{venitCard}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Clienți activi"
                value={scopValue}
                tone="positive"
                hint={scopLabel}
              />
              {venitCard}
            </div>
          )}

          {/* Donuturi luna curentă: prezență, ocupare, retenție */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              {rataPrezentaQ.isLoading ? (
                <Spinner />
              ) : (
                <OverviewDonut
                  title="Rată prezență"
                  percent={rataPrezentaQ.data?.global.rata ?? 0}
                  centerSub={
                    rataPrezentaQ.data
                      ? `${rataPrezentaQ.data.global.prezenti} din ${rataPrezentaQ.data.global.posibile}`
                      : undefined
                  }
                  slices={[
                    {
                      name: 'Prezenți',
                      value: rataPrezentaQ.data?.global.prezenti ?? 0,
                    },
                    {
                      name: 'Lipsă',
                      value: Math.max(
                        0,
                        (rataPrezentaQ.data?.global.posibile ?? 0) -
                          (rataPrezentaQ.data?.global.prezenti ?? 0),
                      ),
                    },
                  ]}
                  emptyMessage="Nicio prezență marcată luna aceasta."
                >
                  {rataPrezentaQ.data &&
                    rataPrezentaQ.data.perLocatie.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-quasar-gray-light pt-3 text-sm">
                        {rataPrezentaQ.data.perLocatie.map((l) => (
                          <li
                            key={l.nume}
                            className="flex justify-between gap-2"
                          >
                            <span className="text-quasar-gray">{l.nume}</span>
                            <span className="font-medium text-quasar-black">
                              {l.rata}%{' '}
                              <span className="text-xs font-normal text-quasar-gray">
                                ({l.prezenti}/{l.posibile})
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                </OverviewDonut>
              )}
            </div>

            <div>
              {ocupareTotalaQ.isLoading ? (
                <Spinner />
              ) : (
                <OverviewDonut
                  title="Grad de ocupare grupe"
                  percent={ocupareTotalaQ.data?.procent ?? 0}
                  centerSub={
                    ocupareTotalaQ.data
                      ? `${ocupareTotalaQ.data.activi} din ${ocupareTotalaQ.data.capacitate}`
                      : undefined
                  }
                  slices={[
                    { name: 'Ocupat', value: ocupareTotalaQ.data?.activi ?? 0 },
                    {
                      name: 'Liber',
                      value: Math.max(
                        0,
                        (ocupareTotalaQ.data?.capacitate ?? 0) -
                          (ocupareTotalaQ.data?.activi ?? 0),
                      ),
                    },
                  ]}
                />
              )}
            </div>

            <div>
              {retentieQ.isLoading ? (
                <Spinner />
              ) : (
                <OverviewDonut
                  title="Retenție membri (luna trecută)"
                  percent={retentieQ.data?.rata ?? 0}
                  centerSub={
                    retentieQ.data
                      ? `${retentieQ.data.retinuti} din ${retentieQ.data.bazaPrev}`
                      : undefined
                  }
                  slices={[
                    { name: 'Reținuți', value: retentieQ.data?.retinuti ?? 0 },
                    { name: 'Pierduți', value: retentieQ.data?.pierduti ?? 0 },
                  ]}
                  emptyMessage="Fără bază de comparație luna trecută."
                />
              )}
            </div>
          </div>
        </div>
    </div>
  )
}
