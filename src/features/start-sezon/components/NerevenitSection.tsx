import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, DataTable, TextInput, type Column } from '@/components/ui'
import { formatRON } from '@/lib/format'
import type { StartSezonNerevenitRow } from '../api'
import { FilterChips, type ChipOption } from './Filtre'
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

type Semnat = 'toti' | 'semnat' | 'nesemnat'
type Stat = 'toate' | 'Activ' | 'Inactiv' | 'EXclient'

export function NerevenitSection({ rows }: { rows: StartSezonNerevenitRow[] }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [locatie, setLocatie] = useState('toate')
  const [semnat, setSemnat] = useState<Semnat>('toti')
  const [stat, setStat] = useState<Stat>('toate')

  // Un om poate avea grupe în două săli; îl număr la fiecare dintre ele.
  const locatii = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      for (const l of (r.locatii ?? '').split(', ').filter(Boolean)) {
        m.set(l, (m.get(l) ?? 0) + 1)
      }
    }
    const opts: ChipOption<string>[] = [
      { value: 'toate', label: 'Toate sălile', count: rows.length },
    ]
    for (const [k, n] of [...m].sort((a, b) => b[1] - a[1])) {
      opts.push({ value: k, label: k, count: n })
    }
    return opts
  }, [rows])

  const nrSemnat = rows.filter((r) => r.semnase).length
  const statCount = (s: Stat) =>
    s === 'toate' ? rows.length : rows.filter((r) => r.status === s).length

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (locatie !== 'toate' && !(r.locatii ?? '').split(', ').includes(locatie)) return false
      if (semnat === 'semnat' && !r.semnase) return false
      if (semnat === 'nesemnat' && r.semnase) return false
      if (stat !== 'toate' && r.status !== stat) return false
      if (!needle) return true
      return [r.nume, r.prenume, r.telefon, r.grupe]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [rows, q, locatie, semnat, stat])

  const columns: Column<StartSezonNerevenitRow>[] = [
    {
      header: 'Nume',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">
            {[r.prenume, r.nume].filter(Boolean).join(' ')}
          </span>
          {r.semnase && (
            <Badge tone="warn">
              <span title="A semnat reînscrierea în campania din primăvară">a semnat</span>
            </Badge>
          )}
        </div>
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
      cell: (r) => (
        <div>
          <span className="text-muted-2">{r.grupe ?? '—'}</span>
          {r.locatii && <div className="text-[11px] text-muted">{r.locatii}</div>}
        </div>
      ),
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
      <div className="mb-4 flex flex-col gap-2">
        <FilterChips
          ariaLabel="Sala"
          value={locatie}
          onChange={setLocatie}
          options={locatii}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <FilterChips
            ariaLabel="Reînscriere semnată"
            value={semnat}
            onChange={setSemnat}
            options={[
              { value: 'toti', label: 'Toți' },
              { value: 'semnat', label: 'Semnaseră reînscrierea', count: nrSemnat },
              { value: 'nesemnat', label: 'Fără semnătură', count: rows.length - nrSemnat },
            ]}
          />
          <FilterChips
            ariaLabel="Status client"
            value={stat}
            onChange={setStat}
            options={(['toate', 'Activ', 'Inactiv', 'EXclient'] as Stat[])
              .filter((s) => s === 'toate' || statCount(s) > 0)
              .map((s) => ({
                value: s,
                label: s === 'toate' ? 'Orice status' : s,
                count: statCount(s),
              }))}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.client_id}
        onRowClick={(r) => navigate(`/clienti/${r.client_id}`)}
        defaultSort={{ idx: 4, dir: 'desc' }}
        maxHeight={460}
        emptyMessage="Niciun rând pentru filtrele alese."
      />
      <p className="mt-3 text-xs text-muted">
        {filtered.length} din {rows.length} afișați.
      </p>
    </Section>
  )
}
