import { Link } from 'react-router-dom'
import { DataTable, Button, type Column } from '@/components/ui'
import { formatRON } from '@/lib/format'
import {
  promisiuneIncalcata,
  statusColectare,
  STATUS_COLECTARE_LABEL,
  type StatusColectare,
  type WorklistRow,
} from './api'

type Props = {
  rows: WorklistRow[]
  onLog: (row: WorklistRow) => void
  onPlata?: (row: WorklistRow) => void
  onSms?: (row: WorklistRow) => void
  smsQueuedIds?: Set<string>
  canSuspend?: boolean
  onSuspend?: (row: WorklistRow) => void
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

const STATUS_PILL: Record<StatusColectare, string> = {
  suspendat: 'bg-danger-bg text-danger',
  promisiune: 'bg-success-bg text-success',
  reminder: 'bg-warn-bg text-warn',
  de_contactat: 'bg-neutral-bg text-muted-2',
}

export function WorklistTable({
  rows,
  onLog,
  onPlata,
  onSms,
  smsQueuedIds,
  canSuspend,
  onSuspend,
}: Props) {
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
      className: 'min-w-40',
      sortValue: (r) => `${r.nume} ${r.prenume ?? ''}`.trim().toLowerCase(),
    },
    {
      header: 'Telefon',
      cell: (r) => r.telefon ?? '—',
      className: 'w-32',
      sortValue: (r) => r.telefon,
    },
    {
      header: 'Ce datorează',
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm">{r.cursuri ?? '—'}</div>
          <div className="text-xs text-quasar-gray">
            {r.nr_rate_neachitate} {r.nr_rate_neachitate === 1 ? 'rată' : 'rate'}
          </div>
        </div>
      ),
      className: 'min-w-40 max-w-56',
      sortValue: (r) => r.nr_rate_neachitate,
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
      className: 'w-28',
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
      className: 'w-32',
    },
    {
      header: 'Promisiune',
      sortValue: (r) => r.promisiune_data,
      cell: (r) =>
        r.promisiune_data ? (
          <span
            className={
              promisiuneIncalcata(r)
                ? 'text-xs font-semibold text-red-600'
                : 'text-xs font-medium text-amber-600'
            }
          >
            {fmtDate(r.promisiune_data)}
            {r.promisiune_suma != null && ` · ${formatRON(r.promisiune_suma)}`}
            {promisiuneIncalcata(r) && ' · încălcată'}
          </span>
        ) : (
          <span className="text-xs text-quasar-gray">—</span>
        ),
      className: 'w-36',
    },
    {
      header: 'Status',
      sortValue: (r) => statusColectare(r),
      cell: (r) => {
        const st = statusColectare(r)
        return (
          <span
            className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_PILL[st]}`}
          >
            {STATUS_COLECTARE_LABEL[st]}
          </span>
        )
      },
      className: 'w-32',
    },
    {
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="secondary" onClick={() => onLog(r)} title="Loghează apel de recuperare">
            📞
          </Button>
          {onPlata && (
            <Button variant="secondary" onClick={() => onPlata(r)} title="Plată nouă">
              💰
            </Button>
          )}
          {onSms &&
            (smsQueuedIds?.has(r.client_id) ? (
              <span
                className="inline-flex items-center rounded-md bg-success-bg px-2 py-1.5 text-xs font-medium text-success"
                title="Reminder pus în coada De trimis"
              >
                ✓ SMS
              </span>
            ) : (
              <Button
                variant="secondary"
                onClick={() => onSms(r)}
                title="Trimite reminder SMS (template restanță, coada De trimis)"
              >
                💬
              </Button>
            ))}
          {canSuspend && onSuspend && (
            <Button
              variant="secondary"
              onClick={() => onSuspend(r)}
              title={
                r.suspendat
                  ? 'Reactivează accesul la clase'
                  : 'Suspendă accesul la clase (prezență + rezervări) până la achitare'
              }
            >
              {r.suspendat ? '↩' : '⛔'}
            </Button>
          )}
        </div>
      ),
      className: 'w-44 text-right',
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.client_id}
      rowClassName={(r) =>
        r.suspendat ? 'bg-neutral-bg/60' : promisiuneIncalcata(r) ? 'bg-red-50/60' : undefined
      }
      emptyMessage="Niciun datornic activ cu rate depășite. 🎉"
    />
  )
}
