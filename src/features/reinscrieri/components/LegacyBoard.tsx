import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, Spinner, type Column } from '@/components/ui'
import {
  getReinscrieriProgress,
  type ReinscriereProgresRow,
} from '../api'
import { LegacyCursModal } from '../modals/LegacyCursModal'

// Board pentru sezon FĂRĂ campanie (fluxul clasic): progres + activare
// individuală „Activează". E și punctul de intrare pentru crearea unei campanii.
export function LegacyBoard({
  sezonId,
  canManage,
  onCreateCampanie,
}: {
  sezonId: string
  canManage: boolean
  onCreateCampanie: () => void
}) {
  const queryClient = useQueryClient()
  const [openCurs, setOpenCurs] = useState<ReinscriereProgresRow | null>(null)

  const progresQ = useQuery({
    queryKey: ['reinscrieri', 'progres', sezonId],
    queryFn: () => getReinscrieriProgress(sezonId),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['reinscrieri', 'progres', sezonId] })
    if (openCurs) {
      void queryClient.invalidateQueries({
        queryKey: ['reinscrieri', 'clienti', openCurs.curs_id],
      })
    }
  }

  const columns: Column<ReinscriereProgresRow>[] = [
    {
      header: 'Curs',
      cell: (r) => <span className="font-medium">{r.curs_nume}</span>,
      sortValue: (r) => r.curs_nume?.toLowerCase(),
    },
    {
      header: 'Grupă',
      cell: (r) => r.varsta ?? '—',
      className: 'w-32',
      sortValue: (r) => r.varsta?.toLowerCase(),
    },
    {
      header: 'Eligibili',
      cell: (r) => r.total_eligibili,
      className: 'w-24 text-right',
      sortValue: (r) => r.total_eligibili ?? 0,
    },
    {
      header: 'Activați',
      cell: (r) => <span className="font-semibold text-quasar-black">{r.activati}</span>,
      className: 'w-24 text-right',
      sortValue: (r) => r.activati ?? 0,
    },
    {
      header: 'Rămași',
      cell: (r) => r.ramasi,
      className: 'w-24 text-right',
      sortValue: (r) => r.ramasi ?? 0,
    },
    {
      header: 'Progres',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-quasar-gray/30">
            <div
              className="h-full bg-quasar-yellow"
              style={{ width: `${Math.min(100, r.procent)}%` }}
            />
          </div>
          <span className="w-12 text-right text-sm">{r.procent}%</span>
        </div>
      ),
      className: 'w-48',
      sortValue: (r) => r.procent ?? 0,
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-md bg-quasar-gray-light/30 px-3 py-2">
        <p className="text-sm text-quasar-gray">
          Nicio campanie organizată pe acest sezon. Poți activa reînscrieri
          individual (flux clasic) sau porni o campanie cu target, taxă și act
          adițional.
        </p>
        {canManage && (
          <Button onClick={onCreateCampanie}>Creează campanie</Button>
        )}
      </div>

      {progresQ.isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={progresQ.data ?? []}
          rowKey={(r) => r.curs_id}
          onRowClick={(r) => setOpenCurs(r)}
          emptyMessage="Niciun curs în sezonul țintă."
        />
      )}

      {openCurs && (
        <LegacyCursModal
          curs={openCurs}
          onClose={() => setOpenCurs(null)}
          onChange={invalidate}
        />
      )}
    </div>
  )
}
