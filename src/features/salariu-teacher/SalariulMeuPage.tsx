import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { SalariuTeacherDetaliu } from '@/components/salarii/SalariuTeacherDetaliu'
import {
  calculDinSnapshot,
  getInAfaraGrilei,
  listSalariiTeacher,
  previewSalariuTeacher,
  type SalariuTeacherCalc,
} from '@/lib/salariuTeacher'
import { getSezonActiv } from '@/features/setari/api'
import { cuLuniConfirmate, luniSimulare } from '@/features/teacheri/lunileSalariilor'
import { formatRON } from '@/lib/format'
import { notaLunaSalarizare } from '@/lib/notaLunaSalarizare'
import { useAuth } from '@/hooks/useAuth'
import { hasTeacherLens, ROLURI_CU_SALARIU_STAFF } from '@/lib/rolesMatrix'
import { getSalariulMeuStaff } from '@/features/salarizare/api'
import { StaffCard } from '@/features/salarizare/StaffCard'
import type { SalariuTeacher } from '@/types/db'

// Identitate stabilă: `?? []` ar face un array nou la fiecare render.
const FARA_SNAPSHOTS: SalariuTeacher[] = []

const RO_LUNI = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

// Grila 2026-2027 e activă (Alex, 7 oct. 2026): fiecare își vede simularea lunilor
// încheiate, adminul o confirmă. O lună e ori snapshot confirmat (imutabil),
// ori simulare recalculată la fiecare load. Cine e în afara grilei vede doar ce s-a confirmat.
type LunaItem =
  | { kind: 'snapshot'; anul: number; luna: number; data: SalariuTeacher }
  | { kind: 'preview'; anul: number; luna: number; data: SalariuTeacherCalc }

function calculFor(item: LunaItem): SalariuTeacherCalc | null {
  return item.kind === 'preview' ? item.data : calculDinSnapshot(item.data)
}

function SalariuCard({ item }: { item: LunaItem }) {
  const [open, setOpen] = useState(false)
  const calc = calculFor(item)
  const total =
    item.kind === 'preview' ? item.data.total : Number(item.data.total)
  const nota = notaLunaSalarizare(item.anul, item.luna)

  return (
    <article className="rounded-lg border border-quasar-gray-light bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-quasar-gray-light/30 max-md:flex-wrap max-md:gap-x-3 max-md:gap-y-1"
      >
        <span className="text-quasar-gray">{open ? '▾' : '▸'}</span>
        <span className="w-40 font-medium text-quasar-black max-md:w-auto">
          {RO_LUNI[item.luna - 1]} {item.anul}
        </span>
        <strong className="w-32 text-right text-quasar-black max-md:ml-auto max-md:w-auto">
          {formatRON(total)}
        </strong>
        <span className="w-40 max-md:w-full">
          {item.kind === 'snapshot' ? (
            <span className="text-emerald-700">✓ Confirmat</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              simulare · de confirmat
            </span>
          )}
        </span>
        <span className="text-sm text-quasar-gray">
          {item.kind === 'snapshot' && item.data.data_plata
            ? `Plătit pe ${item.data.data_plata}`
            : ''}
        </span>
      </button>
      {nota && <p className="px-4 pb-3 text-sm text-quasar-gray">{nota}</p>}

      {open && (
        <div className="border-t border-quasar-gray-light px-4 py-3">
          {calc ? (
            <SalariuTeacherDetaliu calc={calc} />
          ) : (
            <p className="text-sm text-quasar-gray">
              Fără desfășurare pe grupe pentru această lună.
            </p>
          )}
        </div>
      )}
    </article>
  )
}

function SectiuneInstructor({ myTeacherId }: { myTeacherId: string | null }) {
  const teacherId = myTeacherId ?? ''

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const sezonQ = useQuery({ queryKey: ['sezon-activ'], queryFn: getSezonActiv })

  const grilaQ = useQuery({
    queryKey: ['in-afara-grilei', teacherId],
    queryFn: () => getInAfaraGrilei(teacherId),
    enabled: Boolean(teacherId),
  })
  const peGrila = grilaQ.data === false

  const salariiQ = useQuery({
    queryKey: ['my-salarii', teacherId],
    queryFn: () => listSalariiTeacher(teacherId),
    enabled: Boolean(teacherId),
  })

  const snapshots = salariiQ.data ?? FARA_SNAPSHOTS

  // Lunile încheiate ale sezonului (de la grilă încoace), plus lunile confirmate.
  const months = useMemo(
    () =>
      cuLuniConfirmate(
        peGrila
          ? luniSimulare(sezonQ.data?.data_incepere, { y: currentYear, m: currentMonth })
          : [],
        snapshots,
      ),
    [peGrila, sezonQ.data, currentYear, currentMonth, snapshots],
  )
  const monthsNeedingPreview = peGrila
    ? months.filter(
        (mo) => !snapshots.some((s) => s.anul === mo.y && s.luna === mo.m),
      )
    : []

  const previewQueries = useQueries({
    queries: monthsNeedingPreview.map((mo) => ({
      queryKey: ['my-salariu-preview', teacherId, mo.y, mo.m],
      queryFn: () => previewSalariuTeacher(teacherId, mo.y, mo.m),
      enabled: Boolean(teacherId) && !sezonQ.isLoading,
    })),
  })

  if (!myTeacherId) {
    return (
      <p className="text-sm text-quasar-gray">
        Contul tău nu e legat de un profil de instructor. Cere managerului să
        legăm contul.
      </p>
    )
  }

  const previewByKey = new Map<string, SalariuTeacherCalc>()
  monthsNeedingPreview.forEach((mo, idx) => {
    const d = previewQueries[idx]?.data
    if (d) previewByKey.set(`${mo.y}-${mo.m}`, d)
  })

  const items: LunaItem[] = months
    .map<LunaItem | null>((mo) => {
      const snap = snapshots.find((s) => s.anul === mo.y && s.luna === mo.m)
      if (snap) return { kind: 'snapshot', anul: mo.y, luna: mo.m, data: snap }
      const prev = previewByKey.get(`${mo.y}-${mo.m}`)
      // Lunile fără nicio grupă (n-ai predat în sezonul care deține luna) n-au ce
      // spune — le sărim, ca lista să nu fie un șir de rânduri goale.
      if (prev && prev.grupe?.length) {
        return { kind: 'preview', anul: mo.y, luna: mo.m, data: prev }
      }
      return null
    })
    .filter((x): x is LunaItem => x !== null)

  const loading =
    salariiQ.isLoading ||
    sezonQ.isLoading ||
    grilaQ.isLoading ||
    previewQueries.some((q) => q.isLoading)
  const error =
    salariiQ.error ?? grilaQ.error ?? previewQueries.find((q) => q.error)?.error
  const hasPreview = items.some((i) => i.kind === 'preview')

  return (
    <div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(error)}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-quasar-gray">
          {peGrila
            ? 'Simularea apare aici după ce se încheie o lună în care ai avut grupe.'
            : 'Salariul tău nu se calculează pe grila de salarizare, așa că aici nu apare o simulare.'}
        </p>
      ) : (
        <>
          {hasPreview && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Lunile marcate <strong>„simulare"</strong> sunt calculate pe grila
              2026-2027 și se pot schimba până când administratorul confirmă luna
              (de exemplu, dacă se corectează o înrolare pe luna respectivă). Doar
              lunile <strong>„Confirmat"</strong> sunt sume finale.
            </p>
          )}
          <div className="space-y-2">
            {items.map((item) => (
              <SalariuCard
                key={`${item.kind}-${item.anul}-${item.luna}`}
                item={item}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Simularea lunilor încheiate, cu ce e deja confirmat suprapus (aceeași formă ca în /salarizare).
function SectiuneStaff() {
  const today = new Date()
  const lunaCurenta = { y: today.getFullYear(), m: today.getMonth() + 1 }
  const sezonQ = useQuery({ queryKey: ['sezon-activ'], queryFn: getSezonActiv })
  const luni = sezonQ.isLoading ? [] : luniSimulare(sezonQ.data?.data_incepere, lunaCurenta)

  const qs = useQueries({
    queries: luni.map((l) => ({
      queryKey: ['salariul-meu-staff', l.y, l.m],
      queryFn: () => getSalariulMeuStaff(l.y, l.m),
    })),
  })

  if (sezonQ.isLoading || qs.some((q) => q.isLoading)) return <Spinner />
  const error = sezonQ.error ?? qs.find((q) => q.error)?.error
  if (error) return <p className="text-sm text-red-600">Eroare: {humanizeError(error)}</p>

  const carduri = qs.flatMap((q, idx) => {
    const d = q.data
    const l = luni[idx]
    if (!d || !l) return []
    const titlu = `${RO_LUNI[l.m - 1]} ${l.y}`
    const out = []
    if (d.manager) out.push({ cheie: `m-${titlu}`, post: 'manager' as const, om: d.manager, l, titlu })
    if (d.receptie) out.push({ cheie: `r-${titlu}`, post: 'receptie' as const, om: d.receptie, l, titlu })
    return out
  })

  if (carduri.length === 0) {
    return (
      <p className="text-sm text-quasar-gray">Simularea apare aici după ce se încheie prima lună a sezonului.</p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Simularea pe grila 2026-2027. Ce e <strong>„de confirmat"</strong> devine final după ce îl confirmă
        administratorul. Bonusurile care se verifică la finalul lunii următoare (încasările, rata de încasare)
        se plătesc cu salariul lunii următoare: apar acolo, cu numele lunii din care vin.
      </p>
      {carduri.map((c) => {
        const nota = c.post === 'manager' ? notaLunaSalarizare(c.l.y, c.l.m) : null
        return (
          <div key={c.cheie}>
            {nota && <p className="mb-1 text-sm text-quasar-gray">{nota}</p>}
            <StaffCard post={c.post} om={c.om} anul={c.l.y} luna={c.l.m} doarCitire titlu={c.titlu} />
          </div>
        )
      })}
    </div>
  )
}

export function SalariulMeuPage() {
  // Profilul vine din context (rezolvat o dată la login) — nu depinde de rol,
  // deci pagina merge și pentru un manager care predă.
  const { role } = useAuth()
  const { teacherId, loading } = useCurrentTeacherId()
  if (loading) return <Spinner />

  const areInstructor = hasTeacherLens(role, teacherId)
  const areStaff = ROLURI_CU_SALARIU_STAFF.includes(role)
  const titlu = (text: string) =>
    areInstructor && areStaff ? (
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-quasar-gray">{text}</h2>
    ) : null

  return (
    <div>
      <PageHeader
        title="Salariul meu"
        subtitle={areInstructor ? 'Desfă o lună pentru detaliul pe grupe' : undefined}
      />
      <div className="space-y-6">
        {areInstructor && (
          <section>
            {titlu('Instructor')}
            <SectiuneInstructor myTeacherId={teacherId} />
          </section>
        )}
        {areStaff && (
          <section>
            {titlu(role === 'manager' ? 'Manager de studio' : 'Recepție')}
            <SectiuneStaff />
          </section>
        )}
      </div>
    </div>
  )
}
