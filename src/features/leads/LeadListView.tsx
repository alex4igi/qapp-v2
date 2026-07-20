import { useMemo } from 'react'
import { Button, DataTable } from '@/components/ui'
import type { Lead } from '@/types/db'
import { buildLeadColumns, ultimContactMeta } from './leadColumns'
import { exportLeadsCsv } from './leadExport'
import { groupTodayLeads } from './TodayPanel'
import type { LeadFiltersValue } from './LeadFilters'

// Pool-ul Nurture poate depăși 6000 de rânduri. Capul e aplicat de DataTable
// DUPĂ sortare, deci vârful listei rămâne corect (cei mai neglijați primii).
const RENDER_CAP = 300

type Props = {
  leads: Lead[]
  totalLeads: number
  campaniiById: Map<string, string>
  prezentaByLead?: Map<string, string>
  contactatiAzi: Set<string>
  filters: LeadFiltersValue
  onFiltersChange: (next: LeadFiltersValue) => void
  onLeadClick: (lead: Lead) => void
  onLogContact: (lead: Lead) => void
}

function Contor({
  n,
  label,
  cls,
  onClick,
}: {
  n: number
  label: string
  cls: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || n === 0}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-opacity disabled:cursor-default disabled:opacity-60 ${cls} ${onClick && n > 0 ? 'hover:opacity-80' : ''}`}
    >
      {n} {label}
    </button>
  )
}

export function LeadListView({
  leads,
  totalLeads,
  campaniiById,
  prezentaByLead,
  contactatiAzi,
  filters,
  onFiltersChange,
  onLeadClick,
  onLogContact,
}: Props) {
  const now = Date.now()

  // Sortare implicită: cei mai neglijați în vârf (niciodată contactat = ts 0).
  // DataTable pornește cu sortIdx=null și întoarce `rows` neatinse, deci ordinea
  // ține până la primul click pe un antet.
  const sorted = useMemo(
    () =>
      [...leads].sort(
        (a, b) => ultimContactMeta(a, now).ts - ultimContactMeta(b, now).ts,
      ),
    [leads, now],
  )

  const niciodata = useMemo(
    () => leads.filter((l) => !l.ultima_contactare_la).length,
    [leads],
  )
  const deSunat = useMemo(() => {
    const g = groupTodayLeads(leads)
    return (
      g.reminders.length + g.programatiAzi.length + g.callbacks.length +
      g.staleNew.length + g.noFollowup.length + g.inactive.length
    )
  }, [leads])
  const sunateAzi = useMemo(
    () => leads.filter((l) => contactatiAzi.has(l.id)).length,
    [leads, contactatiAzi],
  )

  const columns = buildLeadColumns({
    keys: [
      'nume', 'telefon', 'locatie', 'status', 'ultimContact',
      'prezenta', 'interes', 'observatii', 'sursa', 'actiuni',
    ],
    campaniiById,
    prezentaByLead,
    onLogContact,
    now,
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-quasar-gray">
            {leads.length === totalLeads
              ? `${totalLeads} lead-uri`
              : `${leads.length} din ${totalLeads}`}
          </span>
          <span className="text-quasar-gray">·</span>
          <Contor
            n={niciodata}
            label="niciodată contactate"
            cls="bg-red-100 text-red-700"
            onClick={() => onFiltersChange({ ...filters, contact: 'niciodata' })}
          />
          <Contor
            n={deSunat}
            label="de sunat"
            cls="bg-amber-100 text-amber-700"
          />
          <Contor
            n={sunateAzi}
            label="sunate azi"
            cls="bg-emerald-100 text-emerald-700"
            onClick={() => onFiltersChange({ ...filters, contact: 'azi' })}
          />
        </div>
        <Button
          variant="secondary"
          disabled={leads.length === 0}
          onClick={() => exportLeadsCsv(leads, campaniiById, 'leads-lista.csv', prezentaByLead)}
        >
          ⬇ Export CSV
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={sorted}
        rowKey={(l) => l.id}
        maxRows={RENDER_CAP}
        rowClassName={(l) =>
          contactatiAzi.has(l.id) ? 'bg-emerald-50/40' : undefined
        }
        onRowClick={onLeadClick}
        emptyMessage="Niciun lead pentru filtrele curente."
      />
    </div>
  )
}
