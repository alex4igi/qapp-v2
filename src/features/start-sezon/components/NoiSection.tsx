import { useNavigate } from 'react-router-dom'
import { DataTable, type Column } from '@/components/ui'
import type { StartSezonNouRow } from '../api'
import { Section } from './Section'

export function NoiSection({ rows }: { rows: StartSezonNouRow[] }) {
  const navigate = useNavigate()

  const columns: Column<StartSezonNouRow>[] = [
    {
      header: 'Nume',
      cell: (r) => (
        <span className="font-medium text-ink">
          {[r.prenume, r.nume].filter(Boolean).join(' ')}
        </span>
      ),
      sortValue: (r) => [r.prenume, r.nume].filter(Boolean).join(' '),
    },
    { header: 'Telefon', cell: (r) => r.telefon ?? '—' },
    {
      header: 'Grupa',
      cell: (r) => <span className="text-muted-2">{r.cursuri ?? '—'}</span>,
      sortValue: (r) => r.cursuri ?? '',
    },
    {
      header: 'Fișa deschisă',
      cell: (r) => <span className="fnum">{r.fisa_creata ?? '—'}</span>,
      sortValue: (r) => r.fisa_creata ?? '',
      defaultDir: 'desc',
    },
  ]

  return (
    <Section
      title="Clienți complet noi"
      note="Zero urmă anterioară: nicio înrolare în alt sezon, nicio încasare și nicio prezență înainte de luna de start, fără fișă moștenită din Qapp v1. Nu doar fișă deschisă recent — oameni care n-au mai fost niciodată la Quasar."
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.client_id}
        onRowClick={(r) => navigate(`/clienti/${r.client_id}`)}
        defaultSort={{ idx: 3, dir: 'desc' }}
        emptyMessage="Niciun client complet nou în sezonul selectat."
      />
    </Section>
  )
}
