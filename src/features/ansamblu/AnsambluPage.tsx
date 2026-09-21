import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { sezonActiv, saliWithLocatie } from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { KpiCard } from '@/features/statistici/KpiCard'
import {
  getRataPrezentaLuna,
  getRetentieLuna,
  getVenitLunaComparat,
  lunaCuOffset,
} from '@/features/statistici/api'
import { getAbsente21zCount } from '@/features/absente21z/api'
import { getDatoriiDashboard, restTotal, sumDatorii } from '@/features/datorii/api'
import { getGrupeSubMinim, subMinimLunaAsta } from '@/features/cursuri/api'
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
import { DeUrmarit, type RandDeUrmarit } from './DeUrmarit'

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

const INFO_ABSENTE = (
  <>
    <p className="font-semibold">Ce numără</p>
    <p className="mt-1">
      Cazurile deschise din lista de recuperare: cursanți fără prezență de 21+
      zile, încă necontactați și nereactivați, din sezonul curent.
    </p>
  </>
)

const INFO_GRUPE = (
  <>
    <p className="font-semibold">Ce numără</p>
    <p className="mt-1">
      Grupele sub minimul sălii (8 cursanți plătitori, 6 în SCM Studio 2): cele
      sub minim <strong>luna asta</strong>, plus cele care au închis deja luni sub
      minim.
    </p>
    <p className="mt-1.5">
      La 3 luni încheiate la rând sub minim grupa e <strong>propusă</strong> pentru
      suspendare — decizia rămâne a managerului. Luna în curs e doar avertizare:
      grupa încă se poate umple, iar luna lansării nu se numără.
    </p>
  </>
)

const INFO_DATORII = (
  <>
    <p className="font-semibold">Ce numără</p>
    <p className="mt-1">
      Clienții cu sold restant și totalul restanței cumulate, fără sumele
      prescrise.
    </p>
    <p className="mt-1.5">
      Pe tot clubul, un client cu restanțe la două locații se numără la fiecare.
    </p>
  </>
)

const LUNI_VACANTA = [7, 8]

function numeLuna(luna: string): string {
  const [y, m] = luna.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('ro-RO', {
    month: 'long',
    timeZone: 'UTC',
  })
}

export function AnsambluPage() {
  const { role } = useAuth()
  const isMobile = useIsMobile()
  const { locatieId, locatieNume, ready } = useWorkingLocatie()
  // Pragul minim al grupei e o decizie de management: RPC-ul refuză front_desk-ul,
  // deci rândul nici nu se cere.
  const privileged = isManagerOrHigher(role)

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
  const sezonQ = useQuery({
    queryKey: ['lookup', 'sezon-activ-detaliu'],
    queryFn: sezonActiv,
  })
  const sezon = sezonQ.data ?? null

  const absenteQ = useQuery({
    queryKey: ['ansamblu', 'absente-21z', locatieId, sezon?.data_incepere ?? null],
    queryFn: () => getAbsente21zCount(locatieId, sezon?.data_incepere ?? null),
    enabled: ready && !!sezon,
  })
  const datoriiQ = useQuery({
    queryKey: ['ansamblu', 'datorii', locatieId],
    queryFn: () => getDatoriiDashboard(locatieId),
    enabled: ready,
  })
  const grupeQ = useQuery({
    queryKey: ['ansamblu', 'grupe-sub-minim', sezon?.id ?? null],
    queryFn: () => getGrupeSubMinim({ sezonId: sezon!.id }),
    enabled: privileged && !!sezon,
  })
  // `get_grupe_sub_minim` n-are p_locatie — pragul e al sălii, deci scopăm prin
  // maparea sală → locație.
  const saliQ = useQuery({
    queryKey: ['lookup', 'sali-cu-locatie'],
    queryFn: saliWithLocatie,
    enabled: privileged && !!locatieId,
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
  const datorii = datoriiQ.data ? sumDatorii(datoriiQ.data) : null

  const grupeScop = useMemo(() => {
    const rows = grupeQ.data ?? []
    if (!locatieId) return rows
    const salaLocatie = new Map((saliQ.data ?? []).map((s) => [s.nume, s.locatie]))
    return rows.filter((g) => g.salaNume && salaLocatie.get(g.salaNume) === locatieId)
  }, [grupeQ.data, saliQ.data, locatieId])

  const randuri = useMemo<RandDeUrmarit[]>(() => {
    const out: RandDeUrmarit[] = []

    if (absenteQ.data) {
      out.push({
        key: 'absente',
        valoare: absenteQ.data,
        tone: 'danger',
        text: 'cursanți tăcuți de 21+ zile, necontactați',
        to: '/absente-21z',
        info: INFO_ABSENTE,
      })
    }

    if (privileged) {
      const inCurs = grupeScop.filter((g) => g.sezonInCurs)
      const deSuspendat = inCurs.filter((g) => g.stare === 'de_suspendat').length
      const inObservatie = inCurs.filter((g) => g.stare === 'in_observatie').length
      const lunaAsta = inCurs.filter(subMinimLunaAsta).length
      const total = deSuspendat + inObservatie + lunaAsta
      if (total > 0) {
        const hint = [
          deSuspendat > 0 && `${deSuspendat} propuse pentru suspendare`,
          inObservatie > 0 && `${inObservatie} în observație`,
          lunaAsta > 0 && `${lunaAsta} doar luna asta — încă se pot umple`,
        ]
          .filter(Boolean)
          .join(' · ')
        out.push({
          key: 'grupe',
          valoare: total,
          tone: deSuspendat > 0 ? 'danger' : 'warn',
          text: 'grupe sub minimul sălii',
          hint,
          to: '/cursuri',
          info: INFO_GRUPE,
        })
      }
    }

    if (datorii && datorii.nr_datornici > 0) {
      out.push({
        key: 'datorii',
        valoare: datorii.nr_datornici,
        tone: 'danger',
        text: 'clienți cu restanțe',
        hint: `${formatRON(restTotal(datorii))} restant, fără prescrise`,
        to: '/datorii',
        info: INFO_DATORII,
      })
    }

    return out
  }, [absenteQ.data, privileged, grupeScop, datorii])

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
