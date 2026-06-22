import { DataTable, type Column } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { ScorecardBadge } from './ScorecardBadge'
import type { ScorecardRestanteRow } from './api'

type Props = {
  rows: ScorecardRestanteRow[]
  usersById: Map<string, string>
}

const pct = (v: number | null) => (v == null ? null : `${v}%`)

export function ScorecardRestanteTable({ rows, usersById }: Props) {
  const columns: Column<ScorecardRestanteRow>[] = [
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
            <span title="Decalaj: multe contacte de recuperare, dar ~0 bani efectiv recuperați">
              ⚠️
            </span>
          )}
        </div>
      ),
      className: 'min-w-44',
      sortValue: (r) => (usersById.get(r.user_id) ?? 'Utilizator').toLowerCase(),
    },
    {
      header: 'Contacte',
      cell: (r) => (
        <span>
          <span className="font-semibold text-quasar-black">
            {r.contacte_recuperare}
          </span>
          <ScorecardBadge clasa={r.volum_clasa} />
        </span>
      ),
      className: 'w-28',
      sortValue: (r) => r.contacte_recuperare ?? 0,
    },
    {
      header: 'Clienți',
      cell: (r) => <span>{r.clienti_contactati}</span>,
      className: 'w-20 text-right',
      sortValue: (r) => r.clienti_contactati ?? 0,
    },
    {
      header: 'Recuperat (verif. ≤7z)',
      cell: (r) => (
        <span className="font-semibold text-green-700">
          {formatRON(r.suma_recuperata)}
        </span>
      ),
      className: 'w-36 text-right',
      sortValue: (r) => r.suma_recuperata ?? 0,
    },
    {
      header: 'Rest rămas',
      cell: (r) => (
        <span className="text-red-600">{formatRON(r.rest_ramas)}</span>
      ),
      className: 'w-32 text-right',
      sortValue: (r) => r.rest_ramas ?? 0,
    },
    {
      header: 'Rată recuperare',
      cell: (r) => (
        <ScorecardBadge
          clasa={r.rata_clasa}
          value={pct(r.rata_recuperare_pct)}
        />
      ),
      className: 'w-32',
      sortValue: (r) => r.rata_recuperare_pct ?? 0,
    },
    {
      header: 'Igienă',
      cell: (r) => (
        <ScorecardBadge clasa={r.igiena_clasa} value={pct(r.igiena_pct)} />
      ),
      className: 'w-24',
      sortValue: (r) => r.igiena_pct ?? 0,
    },
    {
      header: 'Scor',
      cell: (r) => (
        <ScorecardBadge
          clasa={r.clasa_generala}
          value={r.scor_pct == null ? '—' : `${r.scor_pct}%`}
        />
      ),
      className: 'w-28',
      sortValue: (r) => r.scor_pct ?? 0,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.user_id}
      emptyMessage="Niciun contact de recuperare logat în luna selectată."
    />
  )
}
