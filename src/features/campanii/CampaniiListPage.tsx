import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { CampaniePromovare } from '@/types/db'
import { CampanieForm } from './CampanieForm'
import { listCampanii, type CampanieWithLeadCount } from './api'

const columns: Column<CampanieWithLeadCount>[] = [
  {
    header: 'Nume',
    cell: (c) => <span className="font-medium">{c.nume}</span>,
  },
  {
    header: 'Canal',
    cell: (c) => c.canal_comunicare ?? '—',
    className: 'w-24',
  },
  {
    header: 'Sub-canal',
    cell: (c) => c.canale_online ?? '—',
    className: 'w-32',
  },
  {
    header: 'Buget',
    cell: (c) => c.bani ?? '—',
    className: 'w-28',
  },
  {
    header: 'Rezultate vizate',
    cell: (c) => (c.rezultate != null ? String(c.rezultate) : '—'),
    className: 'w-32 text-right',
  },
  {
    header: 'Lead-uri',
    cell: (c) => <span className="font-medium">{c.nr_leads}</span>,
    className: 'w-24 text-right',
  },
]

export function CampaniiListPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CampaniePromovare | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['campanii'],
    queryFn: listCampanii,
  })

  return (
    <div>
      <PageHeader
        title="Campanii promovare"
        subtitle={data ? `${data.length} campanii` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Campanie nouă</Button>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {error instanceof Error ? error.message : ''}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          rowKey={(c) => c.id}
          onRowClick={(c) => setEditing(c)}
          emptyMessage="Nicio campanie."
        />
      )}

      {formOpen && (
        <CampanieForm open onClose={() => setFormOpen(false)} />
      )}
      {editing && (
        <CampanieForm
          open
          campanie={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
