import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, DataTable, Spinner, type Column } from '@/components/ui'
import { listAllTemplatesForEditor, type TemplateWithSezon } from './api'
import { CONTRACT_TIP_LABEL } from './constants'

export function SabloaneTab() {
  const navigate = useNavigate()
  const { data: rows, isLoading } = useQuery({
    queryKey: ['contract-templates-editor'],
    queryFn: listAllTemplatesForEditor,
  })

  const columns: Column<TemplateWithSezon>[] = [
    {
      header: 'Nume',
      cell: (r) => r.nume,
      sortValue: (r) => r.nume,
    },
    {
      header: 'Tip',
      cell: (r) => CONTRACT_TIP_LABEL[r.tip] ?? r.tip,
      sortValue: (r) => r.tip,
    },
    {
      header: 'Sezon',
      cell: (r) => r.sezoane?.numele_sezonului ?? '—',
      sortValue: (r) => r.sezoane?.numele_sezonului,
    },
    {
      header: 'Versiune',
      cell: (r) => r.versiune,
      sortValue: (r) => r.versiune,
    },
    {
      header: 'Status',
      cell: (r) => (
        <div className="flex gap-1">
          <Badge tone={r.locked_at ? 'warn' : 'neutral'}>{r.locked_at ? 'Blocat' : 'Draft'}</Badge>
          <Badge tone={r.activ ? 'success' : 'neutral'}>{r.activ ? 'Activ' : 'Inactiv'}</Badge>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => navigate('/contracte/sabloane/nou')}>Șablon nou</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/contracte/sabloane/${r.id}`)}
          emptyMessage="Niciun șablon încă. Creează primul cu butonul de mai sus."
        />
      )}
    </div>
  )
}
