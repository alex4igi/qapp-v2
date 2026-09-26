import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { LUNI_VACANTA } from '@/lib/vacante'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { KpiCard } from '@/features/statistici/KpiCard'
import {
  getRataPrezentaLuna,
  getRetentieLuna,
  getVenitLunaComparat,
  lunaCuOffset,
} from '@/features/statistici/api'
import {
  getClientiActivi,
  getClientiInscrisiSezon,
  getOcuparePeLocatii,
} from './api'
import {
  SituatieLocatiiList,
  SituatieLocatiiTable,
  type SituatieRow,
} from './SituatieLocatiiTable'
import { PrezentaRetentieCard } from './PrezentaRetentieCard'
import { DeUrmarit } from './DeUrmarit'
import { useDeUrmarit } from './useDeUrmarit'

const INFO_INSCRISI = (
  <>
    <p className="font-semibold">Ce numără</p>
    <p className="mt-1">
      Cursanții cu cel puțin o înrolare nereziliată în sezonul activ — „câți am pe
      listă".
    </p>
    <p className="mt-1.5">
      Spre deosebire de „Vin efectiv", cifra nu cade în groapa dintre sezoane:
      contractele noi încep la startul sezonului.
    </p>
  </>
)

const INFO_ACTIVI = (
  <>
    <p className="font-semibold">Ce numără</p>
    <p className="mt-1">
      Cursanții cu un contract care acoperă ziua de azi <strong>sau</strong> cu o
      prezență în ultimele 21 de zile — definiția canonică de „activ".
    </p>
    <p className="mt-1.5">
      Un om se numără o singură dată, chiar dacă merge la mai multe grupe.
    </p>
  </>
)

const INFO_VENIT = (
  <>
    <p className="font-semibold">Cum se calculează</p>
    <p className="mt-1">
      Suma încasărilor pe data plății, atribuite locației la care s-au încasat.
    </p>
    <p className="mt-1.5">
      Comparația e cu <strong>aceeași fereastră</strong> din luna trecută (1 → ziua
      de azi), nu cu luna trecută întreagă — altfel la început de lună variația ar
      fi mereu catastrofală.
    </p>
  </>
)

const INFO_OCUPARE = (
  <>
    <p className="font-semibold">Cum se calculează</p>
    <p className="mt-1">
      Locuri ocupate azi împărțit la capacitatea maximă a tuturor grupelor din
      sezonul activ.
    </p>
    <ul className="mt-1.5 list-disc space-y-1 pl-4">
      <li>
        Intră toate grupele: cursuri, trupe, facultative și Open Class. Grupele
        goale intră în capacitate.
      </li>
      <li>
        Un loc = un cursant cu plată la grupă. Un copil la 2 grupe ocupă 2 locuri.
      </li>
      <li>
        Abonamentul ține locul cât e valabil. O ședință plătită îl ține 30 de zile.
      </li>
      <li>Rezilierile și rezervările anulate nu se numără.</li>
    </ul>
  </>
)

function numeLuna(luna: string): string {
  const [y, m] = luna.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ro-RO', {
    month: 'long',
    timeZone: 'UTC',
  })
}

export function AnsambluPage() {
  const isMobile = useIsMobile()
  const { locatieId, locatieNume, ready } = useWorkingLocatie()

  const inscrisiQ = useQuery({
    queryKey: ['ansamblu', 'inscrisi'],
    queryFn: getClientiInscrisiSezon,
  })
  const activiQ = useQuery({
    queryKey: ['ansamblu', 'activi'],
    queryFn: getClientiActivi,
  })
  const ocupareQ = useQuery({
    queryKey: ['ansamblu', 'ocupare'],
    queryFn: getOcuparePeLocatii,
  })
  const venitQ = useQuery({
    queryKey: ['ansamblu', 'venit', locatieId],
    queryFn: () => getVenitLunaComparat(locatieId),
    enabled: ready,
  })
  const prezentaQ = useQuery({
    queryKey: ['ansamblu', 'prezenta', locatieId],
    queryFn: () => getRataPrezentaLuna(locatieId),
    enabled: ready,
  })
  const retentieQ = useQuery({
    queryKey: ['ansamblu', 'retentie', locatieId],
    queryFn: () => getRetentieLuna(locatieId),
    enabled: ready,
  })
  const situatie = useMemo<SituatieRow[]>(() => {
    const map = new Map<string, SituatieRow>()
    const upsert = (id: string, nume: string) => {
      const existing = map.get(id)
      if (existing) return existing
      const row: SituatieRow = {
        locatieId: id,
        nume,
        inscrisi: 0,
        activi: 0,
        ocupate: null,
        capacitate: null,
        procent: null,
      }
      map.set(id, row)
      return row
    }
    for (const r of inscrisiQ.data ?? []) {
      if (r.locatie_id) upsert(r.locatie_id, r.locatie_nume).inscrisi = r.inscrisi
    }
    for (const r of activiQ.data ?? []) {
      if (r.locatie_id) upsert(r.locatie_id, r.locatie_nume).activi = r.activi
    }
    for (const r of ocupareQ.data?.perLocatie ?? []) {
      if (!r.locatie_id) continue
      const row = upsert(r.locatie_id, r.locatie_nume)
      row.ocupate = r.ocupate
      row.capacitate = r.capacitate
      row.procent = r.procent
    }
    return [...map.values()].sort(
      (a, b) => b.inscrisi - a.inscrisi || a.nume.localeCompare(b.nume, 'ro'),
    )
  }, [inscrisiQ.data, activiQ.data, ocupareQ.data])

  const totalRow: SituatieRow = {
    locatieId: null,
    nume: 'Total club',
    inscrisi: inscrisiQ.data?.find((r) => r.locatie_id === null)?.inscrisi ?? 0,
    activi: activiQ.data?.find((r) => r.locatie_id === null)?.activi ?? 0,
    ocupate: ocupareQ.data?.total.ocupate ?? null,
    capacitate: ocupareQ.data?.total.capacitate ?? null,
    procent: ocupareQ.data?.total.procent ?? null,
  }

  // „—" înseamnă „n-am datele", nu „zero" — un 0% afișat din eroare de rețea se
  // citește ca dezastru operațional.
  const scopat = <T,>(
    incarcat: boolean,
    peLocatie: () => T,
    peClub: () => T,
  ): T | null => (incarcat ? (locatieId ? peLocatie() : peClub()) : null)

  const scopInscrisi = scopat(
    !!inscrisiQ.data,
    () => situatie.find((r) => r.locatieId === locatieId)?.inscrisi ?? 0,
    () => totalRow.inscrisi,
  )
  const scopActivi = scopat(
    !!activiQ.data,
    () => situatie.find((r) => r.locatieId === locatieId)?.activi ?? 0,
    () => totalRow.activi,
  )
  const scopOcupare = ocupareQ.data
    ? locatieId
      ? (ocupareQ.data.perLocatie.find((r) => r.locatie_id === locatieId) ?? null)
      : ocupareQ.data.total
    : null

  const scopLabel = locatieId ? (locatieNume ?? 'locația selectată') : 'total club'

  const azi = new Date()
  const perioadaPrezenta = `1–${azi.getDate()} ${azi
    .toLocaleDateString('ro-RO', { month: 'short' })
    .replace('.', '')}`
  const lunaDe = lunaCuOffset(-2)
  const lunaLa = lunaCuOffset(-1)

  const venit = venitQ.data ?? null

  const { randuri } = useDeUrmarit(locatieId, ready)

  const headcountLoading = inscrisiQ.isLoading || activiQ.isLoading

  return (
    <div>
      <PageHeader title="Overview" />

      <div className="flex flex-col gap-4 lg:gap-6">
        {headcountLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <KpiCard
              label="Înscriși în sezon"
              value={scopInscrisi ?? '—'}
              hint={scopLabel}
              info={INFO_INSCRISI}
            />
            <KpiCard
              label="Vin efectiv"
              value={scopActivi ?? '—'}
              hint={scopLabel}
              info={INFO_ACTIVI}
            />
            <KpiCard
              label="Încasări luna curentă"
              value={venit ? formatRON(venit.curent) : '—'}
              hint={
                venit ? (
                  venit.variatie == null ? (
                    `fără încasări în 1–${venit.panaLaZiua} luna trecută`
                  ) : (
                    <>
                      <span
                        className={
                          venit.variatie >= 0 ? 'text-success' : 'text-danger'
                        }
                      >
                        {venit.variatie >= 0 ? '↑' : '↓'}{' '}
                        {Math.abs(venit.variatie).toLocaleString('ro-RO')}%
                      </span>{' '}
                      față de 1–{venit.panaLaZiua} luna trecută
                    </>
                  )
                ) : undefined
              }
              info={INFO_VENIT}
            />
            <KpiCard
              label="Ocupare grupe"
              value={
                scopOcupare
                  ? `${scopOcupare.procent.toLocaleString('ro-RO')}%`
                  : '—'
              }
              hint={
                scopOcupare
                  ? `${scopOcupare.ocupate} din ${scopOcupare.capacitate} locuri · ${scopLabel}`
                  : undefined
              }
              info={INFO_OCUPARE}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {ocupareQ.isLoading || headcountLoading ? (
              <div className="rounded-2xl border border-line bg-card p-5">
                <Spinner />
              </div>
            ) : isMobile ? (
              <SituatieLocatiiList
                rows={situatie}
                total={totalRow}
                activeLocatieId={locatieId}
              />
            ) : (
              <SituatieLocatiiTable
                rows={situatie}
                total={totalRow}
                activeLocatieId={locatieId}
              />
            )}
          </div>
          <div className="lg:col-span-2">
            <PrezentaRetentieCard
              prezenta={prezentaQ.data}
              retentie={retentieQ.data}
              loading={prezentaQ.isLoading || retentieQ.isLoading}
              perioadaPrezenta={perioadaPrezenta}
              lunaDe={numeLuna(lunaDe)}
              lunaLa={numeLuna(lunaLa)}
              retentieInVacanta={[lunaDe, lunaLa].some((l) =>
                LUNI_VACANTA.includes(Number(l.slice(5, 7))),
              )}
            />
          </div>
        </div>

        <DeUrmarit rows={randuri} />
      </div>
    </div>
  )
}
