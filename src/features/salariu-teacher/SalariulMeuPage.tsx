import { useQuery } from '@tanstack/react-query'
import { PageHeader, Spinner, DataTable, type Column } from '@/components/ui'
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

const columns: Column<SalariuTeacher>[] = [
  {
    header: 'Perioada',
    cell: (s) => `${RO_LUNI[s.luna - 1]} ${s.anul}`,
    className: 'w-40',
  },
  {
    header: 'Total',
    cell: (s) => <strong>{formatRON(s.total)}</strong>,
    className: 'w-32 text-right',
  },
  {
    header: 'Status',
    cell: (s) =>
      s.status === 'platit' ? (
        <span className="text-emerald-700">✓ Plătit</span>
      ) : (
        <span className="text-amber-700">⏳ În așteptare</span>
      ),
    className: 'w-32',
  },
  {
    header: 'Data plății',
    cell: (s) => s.data_plata ?? '—',
    className: 'w-32',
  },
]

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

  return (
    <div>
      <PageHeader
        title="Salariul meu"
        subtitle="Snapshot-uri lunare confirmate de admin"
      />

      {salariiQ.isLoading ? (
        <Spinner />
      ) : salariiQ.isError ? (
        <p className="text-sm text-red-600">
          Eroare:{' '}
          {salariiQ.error instanceof Error ? salariiQ.error.message : ''}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={salariiQ.data ?? []}
          rowKey={(s) => s.id}
          emptyMessage="Niciun salariu confirmat încă."
        />
      )}
    </div>
  )
}
