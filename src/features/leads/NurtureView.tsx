import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner, TextInput, Button, DataTable, type Column } from '@/components/ui'
import { campaniiOptions } from '@/lib/lookups'
import { formatDate } from '@/lib/format'
import { matchesWords } from '@/lib/search'
import type { Lead } from '@/types/db'
import { listNurtureLeads } from './api'
import { exportLeadsCsv } from './leadExport'
import { LeadModal } from './LeadModal'

// Pool-ul Nurture poate avea mii de ex-clienți (istoric + churn nou). Randăm doar
// un cap din rândurile filtrate ca să nu împovărăm DOM-ul; căutarea îngustează lista.
const RENDER_CAP = 200

function numeLead(l: Lead): string {
  const persoana = [l.prenume, l.nume].filter(Boolean).join(' ').trim()
  return persoana || l.nume_parinte || '(fără nume)'
}

export function NurtureView() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editingLead, setEditingLead] = useState<Lead | null>(null)

  const nurtureQuery = useQuery({
    queryKey: ['leads', 'nurture'],
    queryFn: listNurtureLeads,
  })
  const campaniiQuery = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
  })

  const campaniiById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of campaniiQuery.data ?? []) map.set(c.value, c.label)
    return map
  }, [campaniiQuery.data])

  const leads = nurtureQuery.data ?? []

  const filtered = useMemo(() => {
    if (!search.trim()) return leads
    return leads.filter((l) =>
      matchesWords(
        [numeLead(l), l.telefon, l.email].filter(Boolean).join(' '),
        search,
      ),
    )
  }, [leads, search])

  const shown = filtered.slice(0, RENDER_CAP)

  const columns: Column<Lead>[] = [
    {
      header: 'Nume',
      cell: (l) => <span className="font-medium">{numeLead(l)}</span>,
      sortValue: (l) => numeLead(l),
    },
    {
      header: 'Telefon',
      cell: (l) => l.telefon ?? '—',
      sortValue: (l) => l.telefon,
    },
    {
      header: 'Email',
      cell: (l) => l.email ?? '—',
      sortValue: (l) => l.email,
      className: 'text-quasar-gray',
    },
    {
      header: 'Adăugat',
      cell: (l) => formatDate(l.created),
      sortValue: (l) => l.created,
      className: 'text-right',
    },
  ]

  if (nurtureQuery.isLoading) return <Spinner />
  if (nurtureQuery.isError)
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcarea pool-ului Nurture.
      </p>
    )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-xs flex-1">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută după nume, telefon, email…"
          />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-quasar-gray">
            {filtered.length === leads.length
              ? `${leads.length} contacte`
              : `${filtered.length} din ${leads.length}`}
            {filtered.length > RENDER_CAP && (
              <span> · afișate primele {RENDER_CAP}, caută pentru a îngusta</span>
            )}
          </p>
          <Button
            variant="secondary"
            disabled={filtered.length === 0}
            onClick={() =>
              exportLeadsCsv(filtered, campaniiById, 'nurture.csv')
            }
          >
            ⬇ Export CSV
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(l) => l.id}
        onRowClick={(l) => setEditingLead(l)}
        emptyMessage="Niciun contact în Nurture."
      />

      {editingLead && (
        <LeadModal
          open
          lead={editingLead}
          onClose={() => {
            setEditingLead(null)
            void queryClient.invalidateQueries({ queryKey: ['leads'] })
          }}
        />
      )}
    </div>
  )
}
