import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { KpiCard } from '@/features/statistici/KpiCard'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import {
  getRataPrezentaLuna,
  getRetentieLuna,
  getVenitLunaCurenta,
} from '@/features/statistici/api'
import {
  getClientiActivi,
  getClientiInscrisiSezon,
  getOcuparePeLocatii,
} from './api'
import { CursantiPeLocatieChart } from './CursantiPeLocatieChart'

export function AnsambluPage() {
  const { role } = useAuth()
  const isMobile = useIsMobile()
  const { locatieId, locatieNume } = useWorkingLocatie()
  // Pe telefon: doar cifrele. Donut-urile și plăcinta rămân pe laptop.
  const privileged = isManagerOrHigher(role) && !isMobile

  const activiQ = useQuery({
    queryKey: ['ansamblu', 'clienti-activi'],
    queryFn: getClientiActivi,
  })
  const inscrisiQ = useQuery({
    queryKey: ['ansamblu', 'clienti-inscrisi-sezon'],
    queryFn: getClientiInscrisiSezon,
  })
  const venitLunaQ = useQuery({
    queryKey: ['ansamblu', 'venit-luna'],
    queryFn: getVenitLunaCurenta,
  })
  const rataPrezentaQ = useQuery({
    queryKey: ['ansamblu', 'rata-prezenta'],
    queryFn: getRataPrezentaLuna,
  })
  const ocupareQ = useQuery({
    queryKey: ['ansamblu', 'ocupare-locatii'],
    queryFn: getOcuparePeLocatii,
  })
  const retentieQ = useQuery({
    queryKey: ['ansamblu', 'retentie'],
    queryFn: () => getRetentieLuna(),
  })

  const { total, perLocatie } = useMemo(() => {
    const rows = activiQ.data ?? []
    return {
      total: rows.find((r) => r.locatie_id === null)?.activi ?? 0,
      perLocatie: rows.filter((r) => r.locatie_id !== null),
    }
  }, [activiQ.data])

  const { inscrisiTotal, inscrisiPerLocatie } = useMemo(() => {
    const rows = inscrisiQ.data ?? []
    return {
      inscrisiTotal: rows.find((r) => r.locatie_id === null)?.inscrisi ?? 0,
      inscrisiPerLocatie: rows.filter((r) => r.locatie_id !== null),
    }
  }, [inscrisiQ.data])

  const scopLabel = locatieId
    ? `la ${locatieNume ?? 'locația selectată'}`
    : 'unic, pe tot clubul'
  const scopActivi = locatieId
    ? perLocatie.find((r) => r.locatie_id === locatieId)?.activi ?? 0
    : total
  const scopInscrisi = locatieId
    ? inscrisiPerLocatie.find((r) => r.locatie_id === locatieId)?.inscrisi ?? 0
    : inscrisiTotal
  const scopOcupare = locatieId
    ? ocupareQ.data?.perLocatie.find((r) => r.locatie_id === locatieId)
    : ocupareQ.data?.total

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
        subtitle="Înscriși în sezon = are înrolare ne-reziliată în sezonul activ. Vin efectiv = prezent în ultimele 21 de zile."
      />

      <div className="flex flex-col gap-8">
          {/* Clienți activi + venit luna curentă */}
          {activiQ.isLoading || inscrisiQ.isLoading ? (
            <Spinner />
          ) : privileged ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {inscrisiPerLocatie.length > 0 || perLocatie.length > 0 ? (
                <CursantiPeLocatieChart
                  inscrisi={inscrisiPerLocatie}
                  inscrisiTotal={inscrisiTotal}
                  activi={perLocatie}
                  activiTotal={total}
                />
              ) : (
                <KpiCard
                  label="Înscriși în sezon"
                  value={scopInscrisi}
                  tone="positive"
                  hint={scopLabel}
                />
              )}
              <div className="grid grid-cols-1 gap-3 self-start">{venitCard}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Înscriși în sezon"
                value={scopInscrisi}
                tone="positive"
                hint={scopLabel}
              />
              <KpiCard
                label="Vin efectiv"
                value={scopActivi}
                hint="prezenți în ultimele 21 de zile"
              />
              {venitCard}
            </div>
          )}

          {/* Donuturi luna curentă: prezență, ocupare, retenție */}
          {isMobile ? (
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                label="Rată prezență"
                value={`${rataPrezentaQ.data?.global.rata ?? 0}%`}
                hint={
                  rataPrezentaQ.data
                    ? `${rataPrezentaQ.data.global.prezenti} din ${rataPrezentaQ.data.global.posibile}`
                    : undefined
                }
              />
              <KpiCard
                label="Grad de ocupare grupe"
                value={`${(scopOcupare?.procent ?? 0).toLocaleString('ro-RO')}%`}
                hint={
                  scopOcupare
                    ? `${scopOcupare.ocupate} din ${scopOcupare.capacitate} locuri ${locatieId ? `la ${locatieNume ?? 'locația selectată'}` : 'pe tot clubul'}`
                    : undefined
                }
              />
              <KpiCard
                label="Retenție (luna trecută)"
                value={`${retentieQ.data?.rata ?? 0}%`}
                hint={
                  retentieQ.data
                    ? `${retentieQ.data.retinuti} din ${retentieQ.data.bazaPrev}`
                    : undefined
                }
              />
            </div>
          ) : (
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
              {ocupareQ.isLoading ? (
                <Spinner />
              ) : (
                <OverviewDonut
                  title="Grad de ocupare grupe"
                  percent={ocupareQ.data?.total.procent ?? 0}
                  centerSub={
                    ocupareQ.data
                      ? `${ocupareQ.data.total.ocupate} din ${ocupareQ.data.total.capacitate}`
                      : undefined
                  }
                  slices={[
                    { name: 'Ocupat', value: ocupareQ.data?.total.ocupate ?? 0 },
                    {
                      name: 'Liber',
                      value: Math.max(
                        0,
                        (ocupareQ.data?.total.capacitate ?? 0) -
                          (ocupareQ.data?.total.ocupate ?? 0),
                      ),
                    },
                  ]}
                  emptyMessage="Nicio grupă cu capacitate în sezonul activ."
                  info={
                    <>
                      <p className="font-semibold">Cum se calculează</p>
                      <p className="mt-1">
                        Locuri ocupate azi împărțit la capacitatea maximă a
                        tuturor grupelor din sezonul activ.
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4">
                        <li>
                          Intră toate grupele: cursuri, trupe, facultative și
                          Open Class. Grupele goale intră în capacitate.
                        </li>
                        <li>
                          Un loc = un cursant cu plată la grupă. Un copil la 2
                          grupe ocupă 2 locuri.
                        </li>
                        <li>
                          Abonamentul ține locul cât e valabil. O ședință
                          plătită îl ține 30 de zile.
                        </li>
                        <li>Rezilierile și rezervările anulate nu se numără.</li>
                      </ul>
                    </>
                  }
                >
                  {ocupareQ.data && ocupareQ.data.perLocatie.length > 0 && (
                    <div className="mt-3 border-t border-quasar-gray-light pt-3">
                      <ul className="space-y-2.5 text-sm">
                        {ocupareQ.data.perLocatie.map((l) => (
                          <li key={l.locatie_id}>
                            <div className="flex justify-between gap-2">
                              <span className="truncate text-quasar-gray">
                                {l.locatie_nume}
                              </span>
                              <span className="fnum whitespace-nowrap font-semibold text-quasar-black">
                                {l.procent.toLocaleString('ro-RO')}%{' '}
                                <span className="text-xs font-normal text-quasar-gray">
                                  ({l.ocupate}/{l.capacitate})
                                </span>
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-quasar-gray-light">
                              <div
                                className="h-full rounded-full bg-quasar-yellow"
                                style={{ width: `${Math.min(100, l.procent)}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </OverviewDonut>
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
          )}
        </div>
    </div>
  )
}
