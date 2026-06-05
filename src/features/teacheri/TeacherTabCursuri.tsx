import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { DataTable, Spinner, type Column } from '@/components/ui'
import type { VTeacherCursStats } from '@/types/db'
import { getTeacherCursStats } from './api'
import { getSezonActiv } from '../setari/api'

function formatBalanta(b: number) {
  if (!b) return '0 lei'
  const sign = b < 0 ? '−' : '+'
  return `${sign}${Math.abs(b).toLocaleString('ro-RO')} lei`
}

const columns: Column<VTeacherCursStats>[] = [
  {
    header: 'Curs',
    cell: (r) => <span className="font-medium">{r.curs_nume}</span>,
  },
  {
    header: 'Clienți activi',
    cell: (r) => r.clienti_activi ?? 0,
    className: 'w-32',
  },
  {
    header: 'Clienți înscriși',
    cell: (r) => r.clienti_inscrisi ?? 0,
    className: 'w-32',
  },
  {
    header: 'Balanța',
    cell: (r) => (
      <span
        className={
          (r.balanta ?? 0) < 0
            ? 'font-medium text-red-600'
            : (r.balanta ?? 0) > 0
              ? 'font-medium text-green-700'
              : 'text-quasar-gray'
        }
      >
        {formatBalanta(Number(r.balanta ?? 0))}
      </span>
    ),
    className: 'w-32',
  },
]

export function TeacherTabCursuri({ teacherId }: { teacherId: string }) {
  const navigate = useNavigate()
  const sezonQuery = useQuery({
    queryKey: ['sezon-activ'],
    queryFn: getSezonActiv,
  })

  const cursuriQuery = useQuery({
    queryKey: ['teacher', teacherId, 'curs-stats', sezonQuery.data?.id ?? null],
    queryFn: () => getTeacherCursStats(teacherId, sezonQuery.data?.id ?? null),
    enabled: !sezonQuery.isLoading,
  })

  if (sezonQuery.isLoading || cursuriQuery.isLoading) return <Spinner />

  return (
    <div>
      {!sezonQuery.data && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Niciun sezon nu e marcat ca activ în Setări — afișez toate cursurile
          teacher-ului.
        </div>
      )}
      <DataTable
        columns={columns}
        rows={cursuriQuery.data ?? []}
        rowKey={(r) => r.curs_id ?? ''}
        onRowClick={(r) => r.curs_id && navigate(`/cursuri/${r.curs_id}`)}
        emptyMessage="Niciun curs asociat în sezonul activ."
      />
    </div>
  )
}
