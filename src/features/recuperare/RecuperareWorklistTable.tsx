import { Link } from 'react-router-dom'
import { DataTable, Button, type Column } from '@/components/ui'
import { formatRON } from '@/lib/format'
import type { WorklistRow } from './api'

type Props = {
  rows: WorklistRow[]
  onLog: (row: WorklistRow) => void
}

const MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec']

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

const REZULTAT_LABEL: Record<string, string> = {
  reusit: 'Reușit',
  follow_up: 'Follow-up',
  pierdut: 'Pierdut',
}

export function RecuperareWorklistTable({ rows, onLog }: Props) {
  const columns: Column<WorklistRow>[] = [
    {
      header: 'Client',
      cell: (r) => (
        <Link
          to={`/clienti/${r.client_id}`}
          className="font-medium text-quasar-black hover:underline"
        >
          {r.nume} {r.prenume ?? ''}
        </Link>
      ),
      className: 'min-w-44',
      sortValue: (r) => `${r.nume} ${r.prenume ?? ''}`.trim().toLowerCase(),
    },
    {
      header: 'Telefon',
      cell: (r) => r.telefon ?? '—',
      className: 'w-32',
      sortValue: (r) => r.telefon,
    },
    {
      header: 'Rest',
      cell: (r) => (
        <span className="font-semibold text-red-600">
          {formatRON(r.rest_total)}
        </span>
      ),
      className: 'w-28 text-right',
      sortValue: (r) => r.rest_total,
    },
    {
      header: 'Rate',
      cell: (r) => (
        <span className="font-medium">{r.nr_rate_neachitate}</span>
      ),
      className: 'w-16 text-right',
      sortValue: (r) => r.nr_rate_neachitate,
    },
    {
      header: 'Întârziere',
      sortValue: (r) => r.zile_depasire,
      cell: (r) =>
        r.zile_depasire == null ? (
          '—'
        ) : (
          <span
            className={
              r.zile_depasire > 50
                ? 'font-semibold text-red-600'
                : r.zile_depasire > 14
                  ? 'font-medium text-amber-600'
                  : 'text-quasar-gray'
            }
          >
            {r.zile_depasire}z
          </span>
        ),
      className: 'w-24 text-right',
    },
    {
      header: 'Ultima prezență',
      cell: (r) => (
        <span className="text-quasar-gray">{fmtDate(r.ultima_prezenta)}</span>
      ),
      className: 'w-32',
      sortValue: (r) => r.ultima_prezenta,
    },
    {
      header: 'Ultim apel',
      sortValue: (r) => r.ultim_apel_at,
      cell: (r) =>
        r.ultim_apel_at ? (
          <span className="text-xs text-quasar-gray">
            {fmtDate(r.ultim_apel_at)} ·{' '}
            {REZULTAT_LABEL[r.ultim_apel_rezultat ?? ''] ?? r.ultim_apel_rezultat}
          </span>
        ) : (
          <span className="text-xs text-quasar-gray">niciodată</span>
        ),
      className: 'w-36',
    },
    {
      header: '',
      cell: (r) => (
        <Button variant="secondary" onClick={() => onLog(r)}>
          📞 Loghează apel
        </Button>
      ),
      className: 'w-40 text-right',
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.client_id}
      emptyMessage="Niciun datornic activ cu 2+ rate neachitate. 🎉"
    />
  )
}
