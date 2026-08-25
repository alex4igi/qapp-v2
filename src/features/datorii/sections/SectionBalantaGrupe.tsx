import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, MonthPicker, Select, Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { humanizeError } from '@/lib/errorMessage'
import { locatiiOptions } from '@/lib/lookups'
import { lunaCurenta } from '@/features/scorecard/api'
import { getBalantaGrupe } from '../api'
import { BalantaGrupeChart } from './BalantaGrupeChart'
import { DATORII_QO } from './shared'

// Balanța pe grupe pentru o lună: încasat în lună · restant luna asta · restant
// luni anterioare din sezon. Selector propriu de locație (presetat pe 📍) — pe
// „Toate" graficul se întinde cu scroll orizontal.
export function SectionBalantaGrupe({ locatieId: globalLocatieId }: { locatieId: string | null }) {
  const [luna, setLuna] = useState(lunaCurenta())
  const [locatieId, setLocatieId] = useState(globalLocatieId ?? '')
  useEffect(() => setLocatieId(globalLocatieId ?? ''), [globalLocatieId])

  const locatiiQ = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })
  const q = useQuery({
    queryKey: ['datorii', 'balanta-grupe', luna, locatieId || null],
    queryFn: () => getBalantaGrupe(luna, locatieId || null),
    ...DATORII_QO,
  })

  const rows = q.data ?? []
  const tot = rows.reduce(
    (a, r) => ({
      inc: a.inc + r.incasat_luna,
      luna: a.luna + r.restant_luna,
      ant: a.ant + r.restant_anterior,
    }),
    { inc: 0, luna: 0, ant: 0 },
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-quasar-black">Balanța pe grupe</h3>
          <p className="text-xs text-quasar-gray">
            încasat în lună (toți banii intrați) · restant din luna aleasă · restant din lunile anterioare ale sezonului
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-52">
            <Field label="Locație" htmlFor="bg-loc">
              <Select
                id="bg-loc"
                placeholder="Toate locațiile"
                options={locatiiQ.data ?? []}
                value={locatieId}
                onChange={(e) => setLocatieId(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Luna" htmlFor="bg-luna">
              <MonthPicker id="bg-luna" value={luna} onChange={setLuna} />
            </Field>
          </div>
        </div>
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <p className="text-sm text-red-600">Eroare: {humanizeError(q.error)}</p>
      ) : (
        <>
          <p className="mb-2 text-sm">
            <span className="font-semibold text-success">{formatRON(tot.inc)}</span> încasat ·{' '}
            <span className="font-semibold text-danger">{formatRON(tot.luna)}</span> restant luna asta ·{' '}
            <span className="font-semibold text-red-900">{formatRON(tot.ant)}</span> restant anterior
            <span className="text-quasar-gray"> · {rows.length} grupe</span>
          </p>
          <BalantaGrupeChart rows={rows} />
        </>
      )}
    </div>
  )
}
