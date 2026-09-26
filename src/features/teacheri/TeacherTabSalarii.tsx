import { humanizeError } from '@/lib/errorMessage'
import { useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Spinner } from '@/components/ui'
import { SalariuTeacherDetaliu } from '@/components/salarii/SalariuTeacherDetaliu'
import { useAuth } from '@/hooks/useAuth'
import { formatRON } from '@/lib/format'
import { isAdminOrHigher } from '@/lib/rolesMatrix'
import {
  calculDinSnapshot,
  confirmaSalariuTeacher,
  corecteazaSalariuTeacher,
  listSalariiTeacher,
  previewSalariuTeacher,
  type SalariuTeacherCalc,
} from '@/lib/salariuTeacher'
import type { SalariuTeacher } from '@/types/db'
import { getSezonActiv } from '../setari/api'
import { cuLuniConfirmate, monthRange, primaLunaSalarii } from './lunileSalariilor'

// Identitate stabilă: `?? []` ar face un array nou la fiecare render.
const FARA_SNAPSHOTS: SalariuTeacher[] = []

const LUNI_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

type LunaItem =
  | { kind: 'preview'; anul: number; luna: number; calc: SalariuTeacherCalc }
  | { kind: 'snapshot'; anul: number; luna: number; calc: SalariuTeacherCalc | null; row: SalariuTeacher }

function LunaAccordion({
  item,
  isAdmin,
  isOwner,
  defaultOpen,
  onConfirm,
  onCorecteaza,
  seLucreaza,
}: {
  item: LunaItem
  isAdmin: boolean
  isOwner: boolean
  defaultOpen: boolean
  onConfirm: () => void
  onCorecteaza: (motiv: string) => void
  seLucreaza: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const total = item.kind === 'preview' ? item.calc.total : Number(item.row.total)
  const calc = item.calc
  const cursanti = (calc?.grupe ?? []).reduce((s, g) => s + g.cursanti, 0)
  const poateConfirma =
    item.kind === 'preview' && !item.calc.provizoriu && item.calc.blocante.length === 0

  return (
    <div className="rounded-xl border border-line bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-left hover:bg-surface"
      >
        <div className="flex items-center gap-3">
          <span className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <span className="font-medium text-ink">
            {LUNI_RO[item.luna - 1]} {item.anul}
          </span>
          {item.kind === 'snapshot' ? (
            <Badge tone="success">
              ✓ confirmat{item.row.data_plata ? ` · plătit ${item.row.data_plata}` : ''}
              {item.row.corectat_la ? ' · corectat' : ''}
            </Badge>
          ) : item.calc.blocante.length > 0 ? (
            <Badge tone="danger">date lipsă</Badge>
          ) : item.calc.provizoriu ? (
            <Badge tone="warn">luna e în curs</Badge>
          ) : (
            <Badge tone="warn">neconfirmat</Badge>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          {calc && (
            <span className="text-xs text-muted">
              {calc.perioada === 'vara'
                ? `${calc.total_prezente} prezențe de vară`
                : `${cursanti} cursanți plătitori`}
            </span>
          )}
          <span className="font-display text-base font-bold text-ink">{formatRON(total)}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          {calc ? (
            <SalariuTeacherDetaliu calc={calc} />
          ) : (
            <p className="text-sm text-muted">Luna a fost confirmată pe modelul vechi.</p>
          )}
          {item.kind === 'preview' && isAdmin && (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
              {item.calc.provizoriu && (
                <span className="text-xs text-muted">
                  Se poate confirma după {item.calc.final_la}, când luna s-a încheiat.
                </span>
              )}
              <Button onClick={onConfirm} disabled={!poateConfirma || seLucreaza}>
                {seLucreaza ? 'Se confirmă…' : 'Confirmă luna'}
              </Button>
            </div>
          )}
          {item.kind === 'snapshot' && isOwner && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="secondary"
                disabled={seLucreaza}
                onClick={() => {
                  const motiv = window.prompt('De ce corectezi luna confirmată? Motivul rămâne în jurnal.')
                  if (motiv?.trim()) onCorecteaza(motiv.trim())
                }}
              >
                Corectează (recalculează)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TeacherTabSalarii({ teacherId }: { teacherId: string }) {
  const { role } = useAuth()
  const isAdmin = isAdminOrHigher(role)
  const isOwner = role === 'owner'
  const queryClient = useQueryClient()

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const sezonQuery = useQuery({ queryKey: ['sezon-activ'], queryFn: getSezonActiv })

  const snapshotsQuery = useQuery({
    queryKey: ['salarii-teacher', teacherId],
    queryFn: () => listSalariiTeacher(teacherId),
  })
  const snapshots = snapshotsQuery.data ?? FARA_SNAPSHOTS

  // Range: de la începutul sezonului activ (sau ultimele 12 luni fallback) → luna
  // curentă, plus lunile deja confirmate. Vezi `lunileSalariilor.ts`.
  const months = useMemo(
    () =>
      cuLuniConfirmate(
        monthRange(
          primaLunaSalarii(sezonQuery.data?.data_incepere, { y: currentYear, m: currentMonth }),
          { y: currentYear, m: currentMonth },
        ),
        snapshots,
      ),
    [sezonQuery.data, currentYear, currentMonth, snapshots],
  )
  const monthsNeedingPreview = months.filter(
    (mo) => !snapshots.some((s) => s.anul === mo.y && s.luna === mo.m),
  )

  const previewQueries = useQueries({
    queries: monthsNeedingPreview.map((mo) => ({
      queryKey: ['salariu-preview', teacherId, mo.y, mo.m],
      queryFn: () => previewSalariuTeacher(teacherId, mo.y, mo.m),
      enabled: !sezonQuery.isLoading,
      retry: false,
    })),
  })

  const previewByKey = new Map<string, SalariuTeacherCalc>()
  monthsNeedingPreview.forEach((mo, idx) => {
    const q = previewQueries[idx]
    if (q.data) previewByKey.set(`${mo.y}-${mo.m}`, q.data)
  })

  const invalideaza = () => {
    void queryClient.invalidateQueries({ queryKey: ['salarii-teacher', teacherId] })
    void queryClient.invalidateQueries({ queryKey: ['salariu-preview', teacherId] })
    void queryClient.invalidateQueries({ queryKey: ['salarizare-luna'] })
  }

  const confirm = useMutation({
    mutationFn: (mo: { y: number; m: number }) => confirmaSalariuTeacher(teacherId, mo.y, mo.m),
    onSuccess: invalideaza,
  })
  const corecteaza = useMutation({
    mutationFn: (x: { y: number; m: number; motiv: string }) =>
      corecteazaSalariuTeacher(teacherId, x.y, x.m, x.motiv),
    onSuccess: invalideaza,
  })

  const items: LunaItem[] = months
    .map<LunaItem | null>((mo) => {
      const snap = snapshots.find((s) => s.anul === mo.y && s.luna === mo.m)
      if (snap) return { kind: 'snapshot', anul: mo.y, luna: mo.m, calc: calculDinSnapshot(snap), row: snap }
      const prev = previewByKey.get(`${mo.y}-${mo.m}`)
      if (prev) return { kind: 'preview', anul: mo.y, luna: mo.m, calc: prev }
      return null
    })
    .filter((x): x is LunaItem => x !== null)

  const loadingAny =
    snapshotsQuery.isLoading || sezonQuery.isLoading || previewQueries.some((q) => q.isLoading)
  if (loadingAny) return <Spinner />

  // Lunile dinaintea grilei (sept. 2026) n-au parametri: RPC-ul refuză, iar luna nu apare.
  const eroarePreview = previewQueries.find((q) => q.error)?.error
  const eroare = confirm.error ?? corecteaza.error

  return (
    <div className="space-y-4">
      {eroare && (
        <p className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {humanizeError(eroare, 'Operația nu a reușit.')}
        </p>
      )}

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            {eroarePreview
              ? humanizeError(eroarePreview, 'Salariul nu a putut fi calculat.')
              : 'Niciun istoric de salarii.'}
          </p>
        ) : (
          [...items].reverse().map((item, idx) => (
            <LunaAccordion
              key={`${item.kind}-${item.anul}-${item.luna}`}
              item={item}
              isAdmin={isAdmin}
              isOwner={isOwner}
              defaultOpen={idx === 0}
              onConfirm={() => confirm.mutate({ y: item.anul, m: item.luna })}
              onCorecteaza={(motiv) => corecteaza.mutate({ y: item.anul, m: item.luna, motiv })}
              seLucreaza={confirm.isPending || corecteaza.isPending}
            />
          ))
        )}
      </div>
    </div>
  )
}
