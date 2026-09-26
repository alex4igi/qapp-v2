import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatRON } from '@/lib/format'
import { sezonActiv, saliWithLocatie } from '@/lib/lookups'
import { useAuth } from '@/hooks/useAuth'
import { isManagerOrHigher } from '@/lib/rolesMatrix'
import { getAbsente21zCount } from '@/features/absente21z/api'
import { getDatoriiDashboard, restTotal, sumDatorii } from '@/features/datorii/api'
import { getGrupeSubMinim, subMinimLunaAsta } from '@/features/cursuri/api'
import type { RandDeUrmarit } from './DeUrmarit'

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

export type GrupeSubMinimSumar = {
  deSuspendat: number
  inObservatie: number
  lunaAsta: number
  total: number
}

// „De urmărit" e lista operațională de pe /overview; /analytics o citește tot de
// aici ca rezumat, ca cele două pagini să nu poată da răspunsuri diferite.
export function useDeUrmarit(locatieId: string | null, ready: boolean) {
  const { role } = useAuth()
  // Pragul minim al grupei e o decizie de management: RPC-ul refuză front_desk-ul,
  // deci rândul nici nu se cere.
  const privileged = isManagerOrHigher(role)

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

  const datorii = datoriiQ.data ? sumDatorii(datoriiQ.data) : null

  const grupeScop = useMemo(() => {
    const rows = grupeQ.data ?? []
    if (!locatieId) return rows
    const salaLocatie = new Map((saliQ.data ?? []).map((s) => [s.nume, s.locatie]))
    return rows.filter((g) => g.salaNume && salaLocatie.get(g.salaNume) === locatieId)
  }, [grupeQ.data, saliQ.data, locatieId])

  const grupe = useMemo<GrupeSubMinimSumar | null>(() => {
    if (!privileged || !grupeQ.data) return null
    const inCurs = grupeScop.filter((g) => g.sezonInCurs)
    const deSuspendat = inCurs.filter((g) => g.stare === 'de_suspendat').length
    const inObservatie = inCurs.filter((g) => g.stare === 'in_observatie').length
    const lunaAsta = inCurs.filter(subMinimLunaAsta).length
    return { deSuspendat, inObservatie, lunaAsta, total: deSuspendat + inObservatie + lunaAsta }
  }, [privileged, grupeQ.data, grupeScop])

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

    if (grupe && grupe.total > 0) {
      const hint = [
        grupe.deSuspendat > 0 && `${grupe.deSuspendat} propuse pentru suspendare`,
        grupe.inObservatie > 0 && `${grupe.inObservatie} în observație`,
        grupe.lunaAsta > 0 && `${grupe.lunaAsta} doar luna asta — încă se pot umple`,
      ]
        .filter(Boolean)
        .join(' · ')
      out.push({
        key: 'grupe',
        valoare: grupe.total,
        tone: grupe.deSuspendat > 0 ? 'danger' : 'warn',
        text: 'grupe sub minimul sălii',
        hint,
        to: '/cursuri',
        info: INFO_GRUPE,
      })
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
  }, [absenteQ.data, grupe, datorii])

  return { randuri, grupe, absente: absenteQ.data ?? null }
}
