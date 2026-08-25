import { useQuery } from '@tanstack/react-query'
import { DataTable, Spinner, type Column } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { listPraguri, type Prag } from '@/features/scorecard/api'
import { getDatoriiDashboard, rataRestantePct, type DatoriiLocatieRow } from '../api'
import { semaforRataRestante, SEMAFOR_DOT } from '../semafor'
import { DATORII_QO } from './shared'

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
        <span className="font-semibold text-red-600">
          {formatRON(r.rest_net + r.rest_oneoff)}
        </span>
      ),
      className: 'w-36 text-right',
      sortValue: (r) => r.rest_net + r.rest_oneoff,
    },
    {
      header: 'One-off',
      cell: (r) => formatRON(r.rest_oneoff),
      className: 'w-28 text-right',
      sortValue: (r) => r.rest_oneoff,
    },
    {
      header: 'Prescris',
      cell: (r) => <span className="text-quasar-gray">{formatRON(r.rest_prescris)}</span>,
      className: 'w-28 text-right',
      sortValue: (r) => r.rest_prescris,
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
export function SectionComparativLocatii() {
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
    (a, b) => b.rest_net + b.rest_oneoff - (a.rest_net + a.rest_oneoff),
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">Comparativ locații</h3>
      <DataTable
        columns={columnsFor(praguriQ.data)}
        rows={rows}
        rowKey={(r) => r.id_locatie ?? 'fara-locatie'}
        emptyMessage="Nicio datorie înregistrată. 🎉"
      />
    </div>
  )
}
