import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { useCurrentTeacherId } from '@/hooks/useCurrentTeacherId'
import { listSalariiTeacher, previewSalariuTeacher } from '@/features/teacheri/api'
import type { SalariuGrupa, SalariuPreview } from '@/features/teacheri/api'
import { getSezonActiv } from '@/features/setari/api'
import {
  cuLuniConfirmate,
  monthRange,
  primaLunaSalarii,
} from '@/features/teacheri/lunileSalariilor'
import { formatRON } from '@/lib/format'
import type { SalariuTeacher } from '@/types/db'

// Identitate stabilă: `?? []` ar face un array nou la fiecare render.
const FARA_SNAPSHOTS: SalariuTeacher[] = []

const RO_LUNI = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

// Estimările (preview live pentru lunile neconfirmate) rămân ASCUNSE cât timp
// modelul de salarizare e în schimbare — teacherii n-ar trebui să vadă sume
// calculate cu praguri care se modifică înainte de septembrie 2026 (vezi
// memoria project_salariu_model_schimbare_sept). Când modelul e definit, pune
// flag-ul pe `true`: pagina arată atunci și lunile neconfirmate, cu badge
// „estimare". Garda de acces pe RPC (migrațiile 20260722210000/220000) rămâne
// activă indiferent de flag.
const SHOW_ESTIMARI = false

// O lună e ori snapshot confirmat de admin (imutabil, „plătit"), ori preview
// recalculat la fiecare load („estimare"). Aceeași distincție ca în tabul de
// salarii din profilul instructorului.
type LunaItem =
  | { kind: 'snapshot'; anul: number; luna: number; data: SalariuTeacher }
  | { kind: 'preview'; anul: number; luna: number; data: SalariuPreview }

function grupeFor(item: LunaItem): SalariuGrupa[] {
  if (item.kind === 'preview') return item.data.grupe ?? []
  return Array.isArray(item.data.breakdown)
    ? (item.data.breakdown as unknown as SalariuGrupa[])
    : []
}

function SalariuCard({ item }: { item: LunaItem }) {
  const [open, setOpen] = useState(false)
  const grupe = grupeFor(item)
  const total =
    item.kind === 'preview' ? item.data.total : Number(item.data.total)

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
            <span className="text-emerald-700">✓ Plătit</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              estimare · neconfirmat
            </span>
          )}
        </span>
        <span className="text-sm text-quasar-gray">
          {item.kind === 'snapshot' && item.data.data_plata
            ? `Plătit: ${item.data.data_plata}`
            : ''}
        </span>
      </button>

      {open && (
        <div className="border-t border-quasar-gray-light px-4 py-3">
          {grupe.length === 0 ? (
            <p className="text-sm text-quasar-gray">
              Fără desfășurare pe grupe pentru această lună.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-quasar-gray">
                  <th className="py-1">Grupă</th>
                  <th className="py-1">Tip</th>
                  <th className="py-1 text-right">Unități</th>
                  <th className="py-1 text-right">Sumă</th>
                </tr>
              </thead>
              <tbody>
                {grupe.map((g) => (
                  <tr key={g.curs_id} className="border-t border-quasar-gray-light/60">
                    <td className="py-1.5">{g.curs_nume}</td>
                    <td className="py-1.5">
                      <span className="capitalize">{g.tip}</span>
                      {g.manual && (
                        <span className="ml-1 text-xs text-quasar-gray">(manual)</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {g.nr_unitati ?? '—'}
                      {g.prag_unitati_min != null && g.prag_unitati_min > 0 && (
                        <span className="text-xs text-quasar-gray">
                          {' '}/ prag {g.prag_unitati_min}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-medium">
                      {g.manual ? (
                        <span className="text-quasar-gray">manual</span>
                      ) : (
                        formatRON(g.suma ?? 0)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </article>
  )
}

export function SalariulMeuPage() {
  // Profilul vine din context (rezolvat o dată la login) — nu depinde de rol,
  // deci pagina merge și pentru un manager care predă.
  const { teacherId: myTeacherId, loading: teacherLoading } = useCurrentTeacherId()
  const teacherId = myTeacherId ?? ''

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const sezonQ = useQuery({ queryKey: ['sezon-activ'], queryFn: getSezonActiv })

  const salariiQ = useQuery({
    queryKey: ['my-salarii', teacherId],
    queryFn: () => listSalariiTeacher(teacherId),
    enabled: Boolean(teacherId),
  })

  const snapshots = salariiQ.data ?? FARA_SNAPSHOTS

  // Fereastra afișată: de la începutul sezonului activ (fallback: ultimele 12 luni)
  // până la luna curentă, plus lunile confirmate — aceeași regulă ca în tabul de
  // salarii al adminului.
  const months = useMemo(
    () =>
      cuLuniConfirmate(
        monthRange(
          primaLunaSalarii(sezonQ.data?.data_incepere, {
            y: currentYear,
            m: currentMonth,
          }),
          { y: currentYear, m: currentMonth },
        ),
        snapshots,
      ),
    [sezonQ.data, currentYear, currentMonth, snapshots],
  )
  const monthsNeedingPreview = SHOW_ESTIMARI
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

  if (teacherLoading) return <Spinner />
  if (!myTeacherId) {
    return (
      <div>
        <PageHeader title="Salariul meu" />
        <p className="text-sm text-quasar-gray">
          Contul tău nu e legat de un profil de instructor. Cere managerului să
          legăm contul.
        </p>
      </div>
    )
  }

  const previewByKey = new Map<string, SalariuPreview>()
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
    salariiQ.isLoading || sezonQ.isLoading || previewQueries.some((q) => q.isLoading)
  const error = salariiQ.error ?? previewQueries.find((q) => q.error)?.error
  const hasPreview = items.some((i) => i.kind === 'preview')

  return (
    <div>
      <PageHeader
        title="Salariul meu"
        subtitle="Desfă o lună pentru detaliul pe grupe"
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(error)}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-quasar-gray">
          {SHOW_ESTIMARI
            ? 'Nu ai grupe în sezonul curent, deci nu e nimic de calculat.'
            : 'Salariile apar aici după ce managerul confirmă luna.'}
        </p>
      ) : (
        <>
          {hasPreview && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Lunile marcate <strong>„estimare"</strong> sunt calculate live după
              modelul actual și se pot schimba până când managerul confirmă luna.
              Doar lunile <strong>„Plătit"</strong> sunt sume finale.
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
