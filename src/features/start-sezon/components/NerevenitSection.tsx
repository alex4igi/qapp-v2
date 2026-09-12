import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, DataTable, TextInput, type Column } from '@/components/ui'
import { formatRON } from '@/lib/format'
import type { StartSezonNerevenitRow } from '../api'
import { Section } from './Section'

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]

function lunaLabel(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${LUNI[d.getMonth()]} ${d.getFullYear()}`
}

export function NerevenitSection({ rows }: { rows: StartSezonNerevenitRow[] }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) =>
      [r.nume, r.prenume, r.telefon, r.grupe]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [rows, q])

  const columns: Column<StartSezonNerevenitRow>[] = [
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
      header: 'Status',
      cell: (r) =>
        r.status === 'Activ' ? (
          <Badge tone="success">Activ</Badge>
        ) : r.status === 'EXclient' ? (
          <Badge tone="neutral">EXclient</Badge>
        ) : (
          <Badge tone="warn">{r.status ?? '—'}</Badge>
        ),
      sortValue: (r) => r.status ?? '',
    },
    {
      header: 'Grupele de anul trecut',
      cell: (r) => <span className="text-muted-2">{r.grupe ?? '—'}</span>,
      sortValue: (r) => r.grupe ?? '',
    },
    {
      header: 'Ultima lună plătită',
      cell: (r) => lunaLabel(r.ultima_luna),
      sortValue: (r) => r.ultima_luna ?? '',
      defaultDir: 'desc',
    },
    {
      header: 'Plătit atunci',
      cell: (r) => (
        <span className="fnum">{formatRON(Number(r.suma_sezon ?? 0))}</span>
      ),
      className: 'text-right',
      sortValue: (r) => Number(r.suma_sezon ?? 0),
      defaultDir: 'desc',
    },
  ]

  return (
    <Section
      title="Cine nu s-a întors"
      note="Cursanți cu abonament plătit și nereziliat în ultimele luni ale sezonului trecut (inclusiv vara), care nu au încă nicio înrolare în sezonul nou. Click pe rând deschide fișa."
      actions={
        <div className="w-full md:w-72">
          <TextInput
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută după nume, telefon sau grupă…"
            aria-label="Caută în lista celor care nu s-au întors"
          />
        </div>
      }
    >
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.client_id}
        onRowClick={(r) => navigate(`/clienti/${r.client_id}`)}
        defaultSort={{ idx: 4, dir: 'desc' }}
        emptyMessage="Toți cursanții sezonului trecut s-au reînrolat."
      />
      {q.trim() !== '' && (
        <p className="mt-3 text-xs text-muted">
          {filtered.length} din {rows.length} afișați.
        </p>
      )}
    </Section>
  )
}
