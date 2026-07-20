import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Spinner, Button, DataTable } from '@/components/ui'
import { campaniiOptions } from '@/lib/lookups'
import type { Lead } from '@/types/db'
import { listNurtureLeads, lastPrezentaByLead } from './api'
import { perioadaToRange } from './constants'
import { buildLeadColumns } from './leadColumns'
import { exportLeadsCsv } from './leadExport'
import {
  LeadFilters,
  applyLeadFilters,
  EMPTY_LEAD_FILTERS,
  type LeadFiltersValue,
} from './LeadFilters'
import { LeadModal } from './LeadModal'
import { LogContactModal } from './LogContactModal'

// Pool-ul Nurture poate avea mii de ex-clienți. Capul e pasat lui DataTable, care
// îl aplică DUPĂ sortare — tăierea înainte de tabel ar face ca un click pe „Nume"
// să sorteze doar felia vizibilă și să afișeze un prim rând fals.
const RENDER_CAP = 200

export function NurtureView() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<LeadFiltersValue>(EMPTY_LEAD_FILTERS)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [logContactLead, setLogContactLead] = useState<Lead | null>(null)

  const range = perioadaToRange(filters.perioada)
  const nurtureQuery = useQuery({
    queryKey: ['leads', 'nurture', range],
    queryFn: () => listNurtureLeads(range),
  })
  const campaniiQuery = useQuery({
    queryKey: ['lookup', 'campanii'],
    queryFn: campaniiOptions,
  })
  const prezenteQuery = useQuery({
    queryKey: ['leads', 'prezente'],
    queryFn: lastPrezentaByLead,
  })

  const campaniiById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of campaniiQuery.data ?? []) map.set(c.value, c.label)
    return map
  }, [campaniiQuery.data])

  const leads = nurtureQuery.data ?? []

  const filtered = useMemo(
    () => applyLeadFilters(leads, filters),
    [leads, filters],
  )

  const columns = buildLeadColumns({
    keys: [
      'nume', 'telefon', 'locatie', 'ultimContact', 'prezenta',
      'observatii', 'sursa', 'adaugat', 'actiuni',
    ],
    campaniiById,
    prezentaByLead: prezenteQuery.data,
    onLogContact: setLogContactLead,
  })

  if (nurtureQuery.isLoading) return <Spinner />
  if (nurtureQuery.isError)
    return (
      <p className="text-sm text-red-600">
        Eroare la încărcarea pool-ului Nurture.
      </p>
    )

  return (
    <div className="space-y-3">
      <LeadFilters
        value={filters}
        campanii={campaniiQuery.data ?? []}
        onChange={setFilters}
        variant="nurture"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-quasar-gray">
          {filtered.length === leads.length
            ? `${leads.length} contacte`
            : `${filtered.length} din ${leads.length}`}
        </p>
        <Button
          variant="secondary"
          disabled={filtered.length === 0}
          onClick={() =>
            exportLeadsCsv(
              filtered,
              campaniiById,
              'nurture.csv',
              prezenteQuery.data,
            )
          }
        >
          ⬇ Export CSV
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(l) => l.id}
        maxRows={RENDER_CAP}
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
      {logContactLead && (
        <LogContactModal
          open
          lead={logContactLead}
          onClose={() => setLogContactLead(null)}
        />
      )}
    </div>
  )
}
