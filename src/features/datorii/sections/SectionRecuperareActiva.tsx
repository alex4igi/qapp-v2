import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Field, MonthPicker, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { KpiCard } from '@/features/statistici/KpiCard'
import { getScorecardRestante, listPraguri, lunaCurenta } from '@/features/scorecard/api'
import { fereastraRecuperare } from '../semafor'
import { DATORII_QO } from './shared'

// Recuperarea „activă": plăți reale atribuite apelurilor de recuperare (plata
// urmează apelului, în fereastra de N zile) — logica get_scorecard_restante,
// agregată peste operatori. Detaliile per operator rămân pe /scorecard.
export function SectionRecuperareActiva({ locatieId }: { locatieId: string | null }) {
  const [luna, setLuna] = useState(lunaCurenta())

  const q = useQuery({
    queryKey: ['datorii', 'recuperare-activa', luna, locatieId],
    queryFn: () => getScorecardRestante(luna, locatieId),
    ...DATORII_QO,
  })
  const praguriQ = useQuery({
    queryKey: ['scorecard', 'praguri'],
    queryFn: listPraguri,
    ...DATORII_QO,
  })

  const rows = q.data ?? []
  const sumaRecuperata = rows.reduce((a, r) => a + Number(r.suma_recuperata ?? 0), 0)
  const contacte = rows.reduce((a, r) => a + Number(r.contacte_recuperare ?? 0), 0)
  const clienti = rows.reduce((a, r) => a + Number(r.clienti_contactati ?? 0), 0)
  const fereastra = fereastraRecuperare(praguriQ.data)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-quasar-black">Recuperare activă</h3>
          <p className="text-xs text-quasar-gray">
            plăți în max {fereastra} zile după un apel de recuperare ·{' '}
            <Link to="/scorecard" className="underline hover:text-quasar-black">
              detalii per operator →
            </Link>
          </p>
        </div>
        <div className="w-40">
          <Field label="Luna" htmlFor="ra-luna">
            <MonthPicker id="ra-luna" value={luna} onChange={setLuna} />
          </Field>
        </div>
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(q.error)}</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <KpiCard
            label="Sumă recuperată"
            value={formatRON(sumaRecuperata)}
            tone={sumaRecuperata > 0 ? 'positive' : 'default'}
          />
          <KpiCard label="Contacte de recuperare" value={contacte} />
          <KpiCard label="Clienți contactați" value={clienti} />
        </div>
      )}
    </div>
  )
}
