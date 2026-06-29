import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Spinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import type { SalariuTeacher } from '@/types/db'
import { getSezonActiv } from '../setari/api'
import {
  confirmaSalariuTeacher,
  listSalariiTeacher,
  previewSalariuTeacher,
  type SalariuGrupa,
  type SalariuPreview,
} from './api'

const LUNI_RO = [
  'Ianuarie',
  'Februarie',
  'Martie',
  'Aprilie',
  'Mai',
  'Iunie',
  'Iulie',
  'August',
  'Septembrie',
  'Octombrie',
  'Noiembrie',
  'Decembrie',
]

function formatLei(n: number) {
  return `${Number(n || 0).toLocaleString('ro-RO')} lei`
}

function unitLabel(g: SalariuGrupa) {
  if (g.tip === 'facultativ') return 'prezențe'
  return 'cursanți'
}

function GrupaRow({ g }: { g: SalariuGrupa }) {
  if (g.manual) {
    return (
      <tr className="border-t border-gray-200 text-sm">
        <td className="py-2 pr-3 font-medium">{g.curs_nume}</td>
        <td className="py-2 pr-3 text-quasar-gray">trupă</td>
        <td className="py-2 pr-3 text-quasar-gray" colSpan={3}>
          Calcul manual — completați separat
        </td>
      </tr>
    )
  }
  return (
    <tr className="border-t border-gray-200 text-sm">
      <td className="py-2 pr-3 font-medium">{g.curs_nume}</td>
      <td className="py-2 pr-3 text-quasar-gray">
        {g.sedinte_per_sapt
          ? `${g.sedinte_per_sapt} ședinț${g.sedinte_per_sapt === 1 ? 'ă' : 'e'}/săpt`
          : '—'}
      </td>
      <td className="py-2 pr-3">
        {g.nr_unitati ?? 0} {unitLabel(g)}
      </td>
      <td className="py-2 pr-3 text-quasar-gray">
        {g.prag_unitati_min !== null && g.prag_unitati_min > 0
          ? `≥ ${g.prag_unitati_min}`
          : '—'}
      </td>
      <td className="py-2 pr-3 text-right font-medium">{formatLei(g.suma)}</td>
    </tr>
  )
}

function BreakdownTable({ grupe }: { grupe: SalariuGrupa[] }) {
  if (grupe.length === 0) {
    return (
      <p className="py-3 text-sm text-quasar-gray">
        Nu există cursuri pentru această perioadă.
      </p>
    )
  }
  return (
    <table className="w-full">
      <thead className="text-left text-xs text-quasar-gray">
        <tr>
          <th className="pb-2 pr-3">Grupă</th>
          <th className="pb-2 pr-3">Ședințe</th>
          <th className="pb-2 pr-3">Numărați</th>
          <th className="pb-2 pr-3">Prag</th>
          <th className="pb-2 pr-3 text-right">Sumă</th>
        </tr>
      </thead>
      <tbody>
        {grupe.map((g) => (
          <GrupaRow key={g.curs_id} g={g} />
        ))}
      </tbody>
    </table>
  )
}

type LunaItem =
  | { kind: 'preview'; anul: number; luna: number; data: SalariuPreview }
  | { kind: 'snapshot'; anul: number; luna: number; data: SalariuTeacher }

function LunaAccordion({
  item,
  isAdmin,
  defaultOpen,
  onConfirm,
  confirming,
}: {
  item: LunaItem
  isAdmin: boolean
  defaultOpen: boolean
  onConfirm?: () => void
  confirming?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const total =
    item.kind === 'preview' ? item.data.total : Number(item.data.total)
  const grupe =
    item.kind === 'preview'
      ? item.data.grupe
      : ((item.data.breakdown ?? []) as unknown as SalariuGrupa[])

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <span className={`text-quasar-gray transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <span className="font-medium">
            {LUNI_RO[item.luna - 1]} {item.anul}
          </span>
          {item.kind === 'preview' ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              preview · neconfirmat
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              ✓ plătit{' '}
              {item.data.data_plata
                ? `· ${item.data.data_plata}`
                : ''}
            </span>
          )}
        </div>
        <span className="font-display text-base font-bold text-quasar-black">{formatLei(total)}</span>
      </button>
      {open && (
        <div className="border-t border-gray-200 px-4 py-3">
          <BreakdownTable grupe={grupe} />
          {item.kind === 'preview' && isAdmin && (
            <div className="mt-3 flex justify-end">
              <Button onClick={onConfirm} disabled={confirming}>
                {confirming ? 'Se confirmă…' : 'Confirmă & marchează plătit'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function monthRange(start: { y: number; m: number }, end: { y: number; m: number }) {
  // start = mai vechi, end = mai recent. Întoarce listă desc (recent → vechi).
  const out: { y: number; m: number }[] = []
  let y = end.y
  let m = end.m
  while (y > start.y || (y === start.y && m >= start.m)) {
    out.push({ y, m })
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

export function TeacherTabSalarii({ teacherId }: { teacherId: string }) {
  const { role } = useAuth()
  const isAdmin = isAdminOrHigher(role)
  const queryClient = useQueryClient()

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const sezonQuery = useQuery({
    queryKey: ['sezon-activ'],
    queryFn: getSezonActiv,
  })

  const snapshotsQuery = useQuery({
    queryKey: ['salarii-teacher', teacherId],
    queryFn: () => listSalariiTeacher(teacherId),
  })

  // Range: de la începutul sezonului activ (sau ultimele 12 luni fallback) → luna curentă
  const months = useMemo(() => {
    let startY = currentYear
    let startM = currentMonth - 11
    while (startM <= 0) {
      startM += 12
      startY -= 1
    }
    const s = sezonQuery.data
    if (s?.data_incepere) {
      const d = new Date(s.data_incepere)
      startY = d.getFullYear()
      startM = d.getMonth() + 1
    }
    return monthRange(
      { y: startY, m: startM },
      { y: currentYear, m: currentMonth },
    )
  }, [sezonQuery.data, currentYear, currentMonth])

  // Lunile fără snapshot → cerem preview live
  const snapshots = snapshotsQuery.data ?? []
  const monthsNeedingPreview = months.filter(
    (mo) => !snapshots.some((s) => s.anul === mo.y && s.luna === mo.m),
  )

  const previewQueries = useQueries({
    queries: monthsNeedingPreview.map((mo) => ({
      queryKey: ['salariu-preview', teacherId, mo.y, mo.m],
      queryFn: () => previewSalariuTeacher(teacherId, mo.y, mo.m),
      enabled: !sezonQuery.isLoading,
    })),
  })

  const previewByKey = new Map<string, SalariuPreview>()
  monthsNeedingPreview.forEach((mo, idx) => {
    const q = previewQueries[idx]
    if (q.data) previewByKey.set(`${mo.y}-${mo.m}`, q.data)
  })

  const confirm = useMutation({
    mutationFn: (mo: { y: number; m: number }) =>
      confirmaSalariuTeacher(teacherId, mo.y, mo.m),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['salarii-teacher', teacherId],
      })
    },
  })

  const items: LunaItem[] = months
    .map<LunaItem | null>((mo) => {
      const snap = snapshots.find((s) => s.anul === mo.y && s.luna === mo.m)
      if (snap)
        return { kind: 'snapshot', anul: mo.y, luna: mo.m, data: snap }
      const prev = previewByKey.get(`${mo.y}-${mo.m}`)
      if (prev)
        return { kind: 'preview', anul: mo.y, luna: mo.m, data: prev }
      return null
    })
    .filter((x): x is LunaItem => x !== null)

  const loadingAny =
    snapshotsQuery.isLoading ||
    sezonQuery.isLoading ||
    previewQueries.some((q) => q.isLoading)

  if (loadingAny) return <Spinner />

  // Mini-summary = luna curentă (preview live sau snapshot)
  const currentItem = items.find(
    (i) => i.anul === currentYear && i.luna === currentMonth,
  )
  const summaryGrupe =
    currentItem?.kind === 'preview'
      ? currentItem.data.grupe
      : currentItem?.kind === 'snapshot'
        ? ((currentItem.data.breakdown ?? []) as unknown as SalariuGrupa[])
        : []
  const totalLunaCurenta =
    currentItem?.kind === 'preview'
      ? currentItem.data.total
      : currentItem?.kind === 'snapshot'
        ? Number(currentItem.data.total)
        : 0

  return (
    <div className="space-y-4">
      {/* Mini-summary „Cursanți Înrolați" — luna curentă */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-quasar-black">
            Cursanți numărați · {LUNI_RO[currentMonth - 1]} {currentYear}
          </h3>
          <span className="font-display text-base font-bold text-quasar-black">
            Total: {formatLei(totalLunaCurenta)}
          </span>
        </div>
        {summaryGrupe.length === 0 ? (
          <p className="text-sm text-quasar-gray">
            Niciun curs activ pentru luna curentă.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {summaryGrupe.map((g) => (
              <li
                key={g.curs_id}
                className="flex items-baseline justify-between"
              >
                <span>
                  {g.curs_nume}
                  {g.manual && (
                    <span className="ml-2 text-xs text-quasar-gray">
                      (trupă · manual)
                    </span>
                  )}
                </span>
                <span className="font-medium">
                  {g.manual ? '—' : `${g.nr_unitati ?? 0} ${unitLabel(g)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirm.isError && (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {humanizeError(confirm.error, 'necunoscută')}
        </p>
      )}

      {/* Accordion pe luni */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-quasar-gray">
            Niciun istoric de salarii.
          </p>
        ) : (
          items.map((item, idx) => (
            <LunaAccordion
              key={`${item.kind}-${item.anul}-${item.luna}`}
              item={item}
              isAdmin={isAdmin}
              defaultOpen={idx === 0}
              onConfirm={
                item.kind === 'preview'
                  ? () => confirm.mutate({ y: item.anul, m: item.luna })
                  : undefined
              }
              confirming={confirm.isPending}
            />
          ))
        )}
      </div>
    </div>
  )
}
