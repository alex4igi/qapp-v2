import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Button,
  TextInput,
  Field,
  DataTable,
  Spinner,
  type Column,
} from '@/components/ui'
import type { CampaniePromovare } from '@/types/db'
import { CampanieForm } from './CampanieForm'
import { listCampanii, type CampanieWithLeadCount } from './api'

// Cheia de grupare pe canal: Offline e un singur grup; Online se desparte pe sub-canal.
function groupKey(c: CampanieWithLeadCount): string {
  if (c.canal_comunicare === 'Online') {
    return `Online — ${c.canale_online ?? '(fără sub-canal)'}`
  }
  return c.canal_comunicare ?? '(fără canal)'
}

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
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['campanii'],
    queryFn: listCampanii,
  })

  // Filtrare + grupare client-side (toate campaniile sunt deja încărcate, fără paginare).
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = (data ?? []).filter((c) => {
      if (!q) return true
      return (
        c.nume.toLowerCase().includes(q) ||
        (c.descrierea ?? '').toLowerCase().includes(q)
      )
    })
    const map = new Map<string, CampanieWithLeadCount[]>()
    for (const c of rows) {
      const key = groupKey(c)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'ro'))
      .map(([canal, rs]) => ({ canal, rows: rs }))
  }, [data, search])

  const totalFiltrate = useMemo(
    () => groups.reduce((s, g) => s + g.rows.length, 0),
    [groups],
  )

  return (
    <div>
      <PageHeader
        title="Campanii promovare"
        subtitle={data ? `${totalFiltrate} campanii` : undefined}
        actions={
          <Button onClick={() => setFormOpen(true)}>+ Campanie nouă</Button>
        }
      />

      <div className="mb-4 w-72">
        <Field label="Caută" htmlFor="camp-search">
          <TextInput
            id="camp-search"
            placeholder="Nume sau descriere…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <p className="text-sm text-red-600">
          Eroare la încărcare: {error instanceof Error ? error.message : ''}
        </p>
      ) : groups.length === 0 ? (
        <DataTable
          columns={columns}
          rows={[]}
          rowKey={(c) => c.id}
          emptyMessage="Nicio campanie."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.canal}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-quasar-gray">
                {g.canal}{' '}
                <span className="ml-1 font-normal normal-case tracking-normal text-quasar-gray">
                  ({g.rows.length})
                </span>
              </h2>
              <DataTable
                columns={columns}
                rows={g.rows}
                rowKey={(c) => c.id}
                onRowClick={(c) => setEditing(c)}
                emptyMessage="Nicio campanie."
              />
            </section>
          ))}
        </div>
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
