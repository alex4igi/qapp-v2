import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import {
  getRestanteWorklist,
  promisiuneIncalcata,
  type WorklistRow,
} from '../api'
import { DATORII_QO } from './shared'

function zileFata(iso: string): number {
  const azi = new Date(new Date().toISOString().slice(0, 10))
  const d = new Date(iso)
  return Math.round((azi.getTime() - d.getTime()) / 86_400_000)
}

// Promisiuni de plată scadente în următoarele 3 zile sau deja încălcate —
// indiferent de sezon (o promisiune pe o datorie veche contează la fel).
export function SectionPromisiuni({
  locatieId,
  onLog,
}: {
  locatieId: string | null
  onLog: (row: WorklistRow) => void
}) {
  const q = useQuery({
    queryKey: ['restante-worklist', locatieId ?? '', '', ''],
    queryFn: () => getRestanteWorklist({ locatieId }),
    ...DATORII_QO,
  })

  if (q.isLoading) return <Spinner />
  if (q.isError)
    return <p className="text-sm text-red-600">Eroare: {humanizeError(q.error)}</p>

  const limita = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  const rows = (q.data ?? [])
    .filter((r) => r.promisiune_data != null && r.promisiune_data <= limita)
    .sort((a, b) => (a.promisiune_data! < b.promisiune_data! ? -1 : 1))

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-quasar-black">
        Promisiuni scadente {rows.length > 0 && `(${rows.length})`}
      </h3>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-quasar-gray">
          Nicio promisiune scadentă. 🎉
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => {
            const incalcata = promisiuneIncalcata(r)
            const zile = zileFata(r.promisiune_data!)
            return (
              <li key={r.client_id} className="flex items-center gap-3 py-2 text-sm">
                <Link
                  to={`/clienti/${r.client_id}`}
                  className="min-w-40 font-medium text-quasar-black hover:underline"
                >
                  {r.nume} {r.prenume ?? ''}
                </Link>
                <span className="text-quasar-gray">
                  {r.promisiune_suma != null
                    ? `promis ${formatRON(r.promisiune_suma)}`
                    : `rest ${formatRON(r.rest_total)}`}
                </span>
                <span
                  className={
                    incalcata
                      ? 'font-semibold text-red-600'
                      : 'font-medium text-amber-600'
                  }
                >
                  {incalcata
                    ? zile === 0
                      ? 'scadentă azi'
                      : `încălcată de ${zile}z`
                    : `scadentă în ${-zile}z`}
                </span>
                <span className="ml-auto">
                  <Button variant="secondary" onClick={() => onLog(r)} title="Loghează apel">
                    📞
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
