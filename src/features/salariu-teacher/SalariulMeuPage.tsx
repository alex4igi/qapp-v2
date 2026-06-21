import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { listSalariiTeacher } from '@/features/teacheri/api'
import { formatRON } from '@/lib/format'
import type { SalariuTeacher } from '@/types/db'

async function getMyTeacherId(): Promise<string | null> {
  const { data } = await supabase.rpc('current_teacher_id')
  return (data as unknown as string | null) ?? null
}

const RO_LUNI = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]

// Forma unui element din breakdown (vezi calculeaza_salariu_teacher → 'grupe').
type SalGrupa = {
  curs_id: string
  curs_nume: string
  tip: string
  sedinte_per_sapt: number | null
  nr_unitati: number | null
  prag_unitati_min: number | null
  suma: number | null
  manual: boolean | null
}

function grupeFor(s: SalariuTeacher): SalGrupa[] {
  return Array.isArray(s.breakdown) ? (s.breakdown as unknown as SalGrupa[]) : []
}

function SalariuCard({ s }: { s: SalariuTeacher }) {
  const [open, setOpen] = useState(false)
  const grupe = grupeFor(s)
  const platit = s.status === 'platit'

  return (
    <article className="rounded-lg border border-quasar-gray-light bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-quasar-gray-light/30"
      >
        <span className="text-quasar-gray">{open ? '▾' : '▸'}</span>
        <span className="w-40 font-medium text-quasar-black">
          {RO_LUNI[s.luna - 1]} {s.anul}
        </span>
        <strong className="w-32 text-right text-quasar-black">
          {formatRON(s.total)}
        </strong>
        <span className="w-32">
          {platit ? (
            <span className="text-emerald-700">✓ Plătit</span>
          ) : (
            <span className="text-amber-700">⏳ În așteptare</span>
          )}
        </span>
        <span className="text-sm text-quasar-gray">
          {s.data_plata ? `Plătit: ${s.data_plata}` : ''}
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
                      {formatRON(g.suma ?? 0)}
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
  const teacherIdQ = useQuery({
    queryKey: ['my-teacher-id'],
    queryFn: getMyTeacherId,
  })

  const teacherId = teacherIdQ.data ?? ''

  const salariiQ = useQuery({
    queryKey: ['my-salarii', teacherId],
    queryFn: () => listSalariiTeacher(teacherId),
    enabled: Boolean(teacherId),
  })

  if (teacherIdQ.isLoading) return <Spinner />
  if (!teacherIdQ.data) {
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

  const rows = salariiQ.data ?? []

  return (
    <div>
      <PageHeader
        title="Salariul meu"
        subtitle="Snapshot-uri lunare confirmate de admin — desfă o lună pentru detaliul pe grupe"
      />

      {salariiQ.isLoading ? (
        <Spinner />
      ) : salariiQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {salariiQ.error instanceof Error ? salariiQ.error.message : ''}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-quasar-gray">Niciun salariu confirmat încă.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => (
            <SalariuCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}
