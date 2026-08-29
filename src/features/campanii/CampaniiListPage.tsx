import { humanizeError } from '@/lib/errorMessage'
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
import { formatRON } from '@/lib/format'
import { CampanieForm } from './CampanieForm'
import { listCampanii, type CampanieWithLeadCount } from './api'
import { useAuth } from '@/hooks/useAuth'
import { canEditLeads } from '@/lib/rolesMatrix'

// Cheia de grupare pe canal: Offline e un singur grup; Online se desparte pe sub-canal.
function groupKey(c: CampanieWithLeadCount): string {
  if (c.canal_comunicare === 'Online') {
    return `Online — ${c.canale_online ?? '(fără sub-canal)'}`
  }
  return c.canal_comunicare ?? '(fără canal)'
}

// Bugetul e stocat ca text liber (ex: „500 RON", „1.500"). Extragem cifrele.
function parseBani(bani: string | null): number | null {
  if (!bani) return null
  const digits = bani.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

// CAC = cost de achiziție pe lead = buget ÷ nr. lead-uri atribuite campaniei.
function cacLabel(c: CampanieWithLeadCount): string {
  const buget = parseBani(c.bani)
  if (buget == null) return '—'
  if (c.nr_leads <= 0) return 'fără lead-uri'
  return `${formatRON(Math.round(buget / c.nr_leads))}/lead`
}

// Bugetul și CAC-ul sunt cifre interne: agenția de ads își știe propriul cost,
// dar coloanele astea sunt ale noastre. Le construim condiționat.
function buildColumns(aratăBuget: boolean): Column<CampanieWithLeadCount>[] {
  const cols: Column<CampanieWithLeadCount>[] = [
  {
    header: 'Nume',
    cell: (c) => <span className="font-medium">{c.nume}</span>,
    sortValue: (c) => c.nume?.toLowerCase(),
  },
  {
    header: 'Canal',
    cell: (c) => c.canal_comunicare ?? '—',
    className: 'w-24',
    sortValue: (c) => c.canal_comunicare?.toLowerCase(),
  },
  {
    header: 'Sub-canal',
    cell: (c) => c.canale_online ?? '—',
    className: 'w-32',
    sortValue: (c) => c.canale_online?.toLowerCase(),
  },
  {
    header: 'Rezultate vizate',
    cell: (c) => (c.rezultate != null ? String(c.rezultate) : '—'),
    className: 'w-32 text-right',
    sortValue: (c) => c.rezultate ?? 0,
  },
  {
    header: 'Lead-uri',
    cell: (c) => <span className="font-medium">{c.nr_leads}</span>,
    className: 'w-24 text-right',
    sortValue: (c) => c.nr_leads ?? 0,
  },
  ]

  if (aratăBuget) {
    cols.splice(3, 0, {
      header: 'Buget',
      cell: (c) => {
        const b = parseBani(c.bani)
        return b != null ? formatRON(b) : (c.bani ?? '—')
      },
      className: 'w-28 text-right',
      sortValue: (c) => parseBani(c.bani) ?? 0,
    })
    cols.push({
      header: 'CAC (cost/lead)',
      cell: (c) => <span className="font-medium">{cacLabel(c)}</span>,
      className: 'w-32 text-right',
      sortValue: (c) => {
        const buget = parseBani(c.bani)
        if (buget == null || c.nr_leads <= 0) return null
        return Math.round(buget / c.nr_leads)
      },
    })
  }
  return cols
}

export function CampaniiListPage() {
  const { role } = useAuth()
  const poateEdita = canEditLeads(role)
  const columns = useMemo(() => buildColumns(poateEdita), [poateEdita])
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
          poateEdita ? (
            <Button onClick={() => setFormOpen(true)}>+ Campanie nouă</Button>
          ) : undefined
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
          Eroare la încărcare: {humanizeError(error)}
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
                onRowClick={poateEdita ? (c) => setEditing(c) : undefined}
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
