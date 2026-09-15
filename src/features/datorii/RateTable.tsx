import { Link } from 'react-router-dom'
import { DataTable, Button, type Column } from '@/components/ui'
import { formatDate, formatMonth, formatRON } from '@/lib/format'
import type { RateRow } from './api'

type Props = {
  rows: RateRow[]
  /** Fără locație când scopul e o singură locație — coloana ar repeta același nume. */
  showLocatie: boolean
  onLog: (row: RateRow) => void
  onPlata?: (row: RateRow) => void
  emptyMessage?: string
}

function Intarziere({ zile }: { zile: number }) {
  if (zile < 1)
    return (
      <span className="text-xs text-quasar-gray">
        {zile === 0 ? 'scadentă azi' : `în ${-zile}z`}
      </span>
    )
  return (
    <span
      className={
        zile > 50
          ? 'font-semibold text-red-600'
          : zile > 14
            ? 'font-medium text-amber-600'
            : 'text-quasar-gray'
      }
    >
      {zile}z
    </span>
  )
}

// Vederea „Pe rate" a listei de datornici: un rând = o rată (lună × curs).
// Fostul tab Restanțe din /financiar, pe aceeași bază ca worklist-ul pe client.
export function RateTable({ rows, showLocatie, onLog, onPlata, emptyMessage }: Props) {
  const columns: Column<RateRow>[] = [
    {
      header: 'Client',
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/clienti/${r.client_id}`}
            className="font-medium text-quasar-black hover:underline"
          >
            {r.nume} {r.prenume ?? ''}
          </Link>
          {r.status_client && r.status_client !== 'Activ' && (
            <span
              className="rounded-full bg-neutral-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-2"
              title="Datoria nu se stinge la schimbarea statusului — doar la prescriere"
            >
              {r.status_client === 'EXclient' ? 'ex-client' : 'inactiv'}
            </span>
          )}
        </div>
      ),
      className: 'min-w-40',
      sortValue: (r) => `${r.nume} ${r.prenume ?? ''}`.trim().toLowerCase(),
    },
    {
      header: 'Curs',
      cell: (r) => <span className="text-sm">{r.nume_curs ?? '—'}</span>,
      className: 'min-w-36',
      sortValue: (r) => r.nume_curs?.toLowerCase(),
    },
    ...(showLocatie
      ? [
          {
            header: 'Locație',
            cell: (r: RateRow) => r.nume_locatie ?? '—',
            className: 'w-36',
            sortValue: (r: RateRow) => r.nume_locatie?.toLowerCase(),
          } satisfies Column<RateRow>,
        ]
      : []),
    {
      header: 'Luna',
      cell: (r) => <span className="capitalize">{formatMonth(r.data_incepere)}</span>,
      className: 'w-36',
      sortValue: (r) => r.data_incepere,
      defaultDir: 'desc',
    },
    {
      header: 'Scadență',
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-quasar-gray">{formatDate(r.scadenta)}</span>
          <Intarziere zile={r.zile_depasire} />
        </span>
      ),
      className: 'w-36',
      sortValue: (r) => r.zile_depasire,
      defaultDir: 'desc',
    },
    {
      header: 'Total',
      cell: (r) => formatRON(r.total_de_plata),
      className: 'w-28 text-right',
      sortValue: (r) => r.total_de_plata,
    },
    {
      header: 'Plătit',
      cell: (r) => formatRON(r.platit),
      className: 'w-28 text-right',
      sortValue: (r) => r.platit,
    },
    {
      header: 'Rest',
      cell: (r) => <span className="font-semibold text-red-600">{formatRON(r.rest)}</span>,
      className: 'w-28 text-right',
      sortValue: (r) => r.rest,
      defaultDir: 'desc',
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
        </div>
      ),
      className: 'w-24 text-right',
    },
  ]

  // Sortarea implicită = luna, cele mai noi primele (raportul „restanțe după lună").
  const lunaIdx = showLocatie ? 3 : 2

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id_enrollment}
      defaultSort={{ idx: lunaIdx, dir: 'desc' }}
      rowClassName={(r) => (r.suspendat ? 'bg-neutral-bg/60' : undefined)}
      emptyMessage={emptyMessage ?? 'Nicio rată depășită. 🎉'}
    />
  )
}
