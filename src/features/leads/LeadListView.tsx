import { useMemo } from 'react'
import { DataTable } from '@/components/ui'
import type { Lead } from '@/types/db'
import { buildLeadColumns, type LeadColumnKey } from './leadColumns'
import { exportLeadsCsv } from './leadExport'
import type { LeadFiltersValue } from './LeadFilters'

// Pool-ul Nurture poate depăși 6000 de rânduri. Capul e aplicat de DataTable
// DUPĂ sortare, deci vârful listei rămâne corect (cei mai neglijați primii).
const RENDER_CAP = 300

const COLOANE: LeadColumnKey[] = [
  'nume', 'telefon', 'locatie', 'status', 'ultimContact', 'adaugat',
  'prezenta', 'interes', 'observatii', 'actiuni',
]

// Lista se deschide ordonată după „Ultim contact" crescător — dar ca sortare
// REALĂ a tabelului, nu ca pre-sortare a rândurilor: doar așa antetul se aprinde
// cu ▲ și utilizatorul vede după ce e ordonat. Cine vrea prioritizare pe intrare
// dă click pe „Adăugat" (primul click = cele mai noi sus).
const SORT_IMPLICIT = { idx: COLOANE.indexOf('ultimContact'), dir: 'asc' } as const

// Contoarele + exportul, compacte, ca să încapă pe rândul de filtre în loc să
// ocupe o bară proprie. Fiecare contor e un filtru cu un click.
export function ListaContoare({
  leads,
  contactatiAzi,
  campaniiById,
  prezentaByLead,
  filters,
  onFiltersChange,
}: {
  leads: Lead[]
  contactatiAzi: Set<string>
  campaniiById: Map<string, string>
  prezentaByLead?: Map<string, string>
  filters: LeadFiltersValue
  onFiltersChange: (next: LeadFiltersValue) => void
}) {
  const niciodata = useMemo(
    () => leads.filter((l) => !l.ultima_contactare_la).length,
    [leads],
  )
  const sunateAzi = useMemo(
    () => leads.filter((l) => contactatiAzi.has(l.id)).length,
    [leads, contactatiAzi],
  )

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-quasar-gray">{leads.length} lead-uri</span>
      <button
        type="button"
        disabled={niciodata === 0}
        onClick={() => onFiltersChange({ ...filters, contact: 'niciodata' })}
        className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 disabled:opacity-50 enabled:hover:opacity-80"
        title="Niciodată contactate — filtrează"
      >
        🔴 {niciodata}
      </button>
      <button
        type="button"
        disabled={sunateAzi === 0}
        onClick={() => onFiltersChange({ ...filters, contact: 'azi' })}
        className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 disabled:opacity-50 enabled:hover:opacity-80"
        title="Contactate azi — filtrează"
      >
        ✅ {sunateAzi}
      </button>
      <button
        type="button"
        disabled={leads.length === 0}
        onClick={() =>
          exportLeadsCsv(leads, campaniiById, 'leads-lista.csv', prezentaByLead)
        }
        className="rounded p-1 text-quasar-gray hover:bg-quasar-gray-light hover:text-quasar-black disabled:opacity-40"
        title="Export CSV (lista filtrată)"
      >
        ⬇
      </button>
    </div>
  )
}

type Props = {
  leads: Lead[]
  campaniiById: Map<string, string>
  prezentaByLead?: Map<string, string>
  contactatiAzi: Set<string>
  onLeadClick: (lead: Lead) => void
  onLogContact?: (lead: Lead) => void
}

export function LeadListView({
  leads,
  campaniiById,
  prezentaByLead,
  contactatiAzi,
  onLeadClick,
  onLogContact,
}: Props) {
  const now = Date.now()

  const columns = buildLeadColumns({
    keys: COLOANE,
    campaniiById,
    prezentaByLead,
    onLogContact,
    now,
  })

  return (
    <DataTable
      columns={columns}
      rows={leads}
      rowKey={(l) => l.id}
      defaultSort={SORT_IMPLICIT}
      maxRows={RENDER_CAP}
      rowClassName={(l) =>
        contactatiAzi.has(l.id) ? 'bg-emerald-50/40' : undefined
      }
      onRowClick={onLeadClick}
      emptyMessage="Niciun lead pentru filtrele curente."
    />
  )
}
