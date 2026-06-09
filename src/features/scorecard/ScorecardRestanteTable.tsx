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
    },
    {
      header: 'Clienți',
      cell: (r) => <span>{r.clienti_contactati}</span>,
      className: 'w-20 text-right',
    },
    {
      header: 'Recuperat (verif. ≤7z)',
      cell: (r) => (
        <span className="font-semibold text-green-700">
          {formatRON(r.suma_recuperata)}
        </span>
      ),
      className: 'w-36 text-right',
    },
    {
      header: 'Rest rămas',
      cell: (r) => (
        <span className="text-red-600">{formatRON(r.rest_ramas)}</span>
      ),
      className: 'w-32 text-right',
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
    },
    {
      header: 'Igienă',
      cell: (r) => (
        <ScorecardBadge clasa={r.igiena_clasa} value={pct(r.igiena_pct)} />
      ),
      className: 'w-24',
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
