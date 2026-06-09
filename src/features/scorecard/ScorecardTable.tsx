import { DataTable, type Column } from '@/components/ui'
import { ScorecardBadge } from './ScorecardBadge'
import type { ScorecardRow } from './api'

type Props = {
  rows: ScorecardRow[]
  usersById: Map<string, string>
}

const ore = (v: number | null) => (v == null ? null : `${v}h`)
const pct = (v: number | null) => (v == null ? null : `${v}%`)
const num = (v: number | null) => (v == null ? null : `${v}`)

export function ScorecardTable({ rows, usersById }: Props) {
  const columns: Column<ScorecardRow>[] = [
    {
      header: 'Operator',
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-quasar-black">
            {usersById.get(r.user_id) ?? 'Utilizator'}
          </span>
          {r.rafala_flag && (
            <span title="Rafală: multe contacte într-un interval foarte scurt">
              🚩
            </span>
          )}
          {r.decalaj_flag && (
            <span title="Decalaj: activitate mare, dar puține contacte verificate">
              ⚠️
            </span>
          )}
        </div>
      ),
      className: 'min-w-44',
    },
    {
      header: 'Contacte (verif. / total)',
      cell: (r) => (
        <span>
          <span className="font-semibold text-quasar-black">
            {r.contacte_verificate}
          </span>
          <span className="text-quasar-gray"> / {r.contacte_total}</span>
          <ScorecardBadge clasa={r.volum_clasa} />
        </span>
      ),
      className: 'w-44',
    },
    {
      header: 'Viteză',
      cell: (r) => (
        <ScorecardBadge clasa={r.viteza_clasa} value={ore(r.viteza_med_ore)} />
      ),
      className: 'w-28',
    },
    {
      header: 'Persistență',
      cell: (r) => (
        <ScorecardBadge
          clasa={r.persistenta_clasa}
          value={num(r.persistenta_med)}
        />
      ),
      className: 'w-28',
    },
    {
      header: 'Igienă CRM',
      cell: (r) => (
        <ScorecardBadge clasa={r.igiena_clasa} value={pct(r.igiena_crm_pct)} />
      ),
      className: 'w-28',
    },
    {
      header: 'Follow-up',
      cell: (r) => (
        <span className="text-quasar-black">
          {pct(r.followup_onorat_pct) ?? '—'}
        </span>
      ),
      className: 'w-24',
    },
    {
      header: 'Conversie',
      cell: (r) => (
        <ScorecardBadge
          clasa={r.conversie_clasa}
          value={pct(r.conversie_pct)}
        />
      ),
      className: 'w-28',
    },
    {
      header: 'Show-rate',
      cell: (r) => (
        <ScorecardBadge clasa={r.show_rate_clasa} value={pct(r.show_rate_pct)} />
      ),
      className: 'w-28',
    },
    {
      header: 'Scor',
      cell: (r) => (
        <span className="font-semibold">
          <ScorecardBadge
            clasa={r.clasa_generala}
            value={r.scor_pct == null ? '—' : `${r.scor_pct}%`}
          />
        </span>
      ),
      className: 'w-28',
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.user_id}
      emptyMessage="Niciun contact logat în luna selectată."
    />
  )
}
