import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { listPraguri, type Prag } from '@/features/scorecard/api'
import {
  getDatoriiDashboard,
  rataRestantePct,
  restLuna,
  restTotal,
  type DatoriiLocatieRow,
} from '../api'
import { semaforRataRestante, SEMAFOR_DOT } from '../semafor'
import { DATORII_QO, LUNA_CURENTA_LABEL } from './shared'

function columnsFor(praguri: Prag[] | undefined): Column<DatoriiLocatieRow>[] {
  return [
    {
      header: 'Locație',
      cell: (r) => <span className="font-medium">{r.nume_locatie ?? 'Fără locație'}</span>,
      sortValue: (r) => r.nume_locatie,
    },
    {
      header: 'Rest recuperabil',
      cell: (r) => (
        <span className="font-semibold text-red-600">{formatRON(restLuna(r))}</span>
      ),
      className: 'w-36 text-right',
      sortValue: (r) => restLuna(r),
    },
    {
      header: 'Recuperat în lună',
      cell: (r) => (
        <span className={r.recuperat_luna > 0 ? 'font-medium text-emerald-600' : undefined}>
          {formatRON(r.recuperat_luna)}
        </span>
      ),
      className: 'w-32 text-right',
      sortValue: (r) => r.recuperat_luna,
    },
    {
      header: 'Sold istoric',
      cell: (r) => <span className="text-quasar-gray">{formatRON(restTotal(r))}</span>,
      className: 'w-32 text-right',
      sortValue: (r) => restTotal(r),
    },
    {
      header: 'Datornici',
      cell: (r) => r.nr_datornici,
      className: 'w-24 text-right',
      sortValue: (r) => r.nr_datornici,
    },
    {
      header: 'Rata',
      sortValue: (r) => rataRestantePct(r),
      cell: (r) => {
        const rata = rataRestantePct(r)
        const semafor = semaforRataRestante(rata, praguri)
        return (
          <span className="inline-flex items-center gap-1.5 font-medium">
            {semafor && (
              <span className={`h-2.5 w-2.5 rounded-full ${SEMAFOR_DOT[semafor]}`} />
            )}
            {rata == null ? '—' : `${rata}%`}
          </span>
        )
      },
      className: 'w-24 text-right',
    },
  ]
}

// Vizibilă doar pe scopul „Toate locațiile" — comparativul per locație cu semafor.
// Click pe un rând filtrează worklist-ul de mai jos pe locația respectivă.
export function SectionComparativLocatii({
  onPick,
  activeId,
}: {
  onPick?: (row: DatoriiLocatieRow) => void
  activeId?: string | null
}) {
  const dashQ = useQuery({
    queryKey: ['datorii', 'dashboard', null],
    queryFn: () => getDatoriiDashboard(null),
    ...DATORII_QO,
  })
  const praguriQ = useQuery({
    queryKey: ['scorecard', 'praguri'],
    queryFn: listPraguri,
    ...DATORII_QO,
  })

  if (dashQ.isLoading) return <Spinner />
  if (dashQ.isError)
    return <p className="text-sm text-red-600">Eroare: {humanizeError(dashQ.error)}</p>

  const rows = [...(dashQ.data ?? [])].sort(
    (a, b) => restLuna(b) - restLuna(a) || restTotal(b) - restTotal(a),
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Comparativ locații · {LUNA_CURENTA_LABEL}
        {onPick && (
          <span className="ml-2 text-xs font-normal text-quasar-gray">
            clic pe o locație filtrează lista de datornici
          </span>
        )}
      </h3>
      <DataTable
        columns={columnsFor(praguriQ.data)}
        rows={rows}
        rowKey={(r) => r.id_locatie ?? 'fara-locatie'}
        onRowClick={onPick}
        rowClassName={(r) =>
          activeId && r.id_locatie === activeId ? 'bg-quasar-yellow/10' : undefined
        }
        emptyMessage="Nicio datorie înregistrată. 🎉"
      />
    </div>
  )
}
