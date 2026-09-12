import { useNavigate } from 'react-router-dom'
import { Badge, DataTable, type Column } from '@/components/ui'
import type { StartSezonRosterRow } from '../api'
import { CompozitieBar, CompozitieLegenda } from './Compozitie'
import { Section } from './Section'

export function RosterSection({ rows }: { rows: StartSezonRosterRow[] }) {
  const navigate = useNavigate()

  const columns: Column<StartSezonRosterRow>[] = [
    {
      header: 'Grupă',
      cell: (r) => (
        <span className={r.inscrisi === 0 ? 'text-muted' : 'font-medium text-ink'}>
          {r.curs_nume}
          {r.facultativ && (
            <Badge tone="neutral" className="ml-2">
              facultativ
            </Badge>
          )}
        </span>
      ),
      sortValue: (r) => r.curs_nume,
    },
    {
      header: 'Locație',
      cell: (r) => <span className="text-muted-2">{r.locatie_nume}</span>,
      sortValue: (r) => r.locatie_nume,
    },
    {
      header: 'Teacher',
      cell: (r) => <span className="text-muted-2">{r.teacher_nume}</span>,
      sortValue: (r) => r.teacher_nume,
    },
    {
      header: 'Înscriși',
      cell: (r) => (
        <span className="fnum">
          {r.inscrisi}
          {r.capacitate != null && (
            <span className="text-muted"> / {r.capacitate}</span>
          )}
        </span>
      ),
      className: 'text-right',
      sortValue: (r) => r.inscrisi,
      defaultDir: 'desc',
    },
    {
      header: 'De unde vin',
      cell: (r) => <CompozitieBar row={r} />,
      className: 'w-[150px]',
      sortValue: (r) => r.cat_n,
      defaultDir: 'desc',
    },
  ]

  const goale = rows.filter((r) => r.inscrisi === 0).length

  return (
    <Section
      title="Grupele sezonului nou"
      note={
        goale > 0
          ? `Toate grupele create pentru sezon, cu proveniența celor înscriși. ${goale} ${goale === 1 ? 'grupă nu are' : 'de grupe nu au'} încă niciun cursant.`
          : 'Toate grupele create pentru sezon, cu proveniența celor înscriși.'
      }
      actions={<CompozitieLegenda />}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.curs_id}
        onRowClick={(r) => navigate(`/cursuri/${r.curs_id}`)}
        defaultSort={{ idx: 3, dir: 'desc' }}
        emptyMessage="Niciun curs creat pentru sezonul selectat."
      />
    </Section>
  )
}
