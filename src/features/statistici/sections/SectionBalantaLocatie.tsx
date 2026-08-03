import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { locatiiOptions } from '@/lib/lookups'
import { getBalantaLocatie, type Interval } from '../api'
import { BalantaChart } from '../BalantaChart'
import { STAT_QO } from './shared'

export function SectionBalantaLocatie({ interval }: { interval: Interval }) {
  const [locatieId, setLocatieId] = useState('')

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const balLocQ = useQuery({
    queryKey: ['stat', 'bal-locatie', interval, locatieId],
    queryFn: () => getBalantaLocatie(interval, locatieId || null),
    ...STAT_QO,
  })

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">
          Balanță locație
        </h2>
        <div className="w-64">
          <Field label="Locație" htmlFor="stat-locatie">
            <Select
              id="stat-locatie"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={locatieId}
              onChange={(e) => setLocatieId(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {balLocQ.isLoading ? (
        <Spinner />
      ) : (
        <BalantaChart
          title={
            locatieId
              ? locatiiQ.data?.find((o) => o.value === locatieId)?.label ??
                'Locația selectată'
              : 'Toate locațiile'
          }
          rows={balLocQ.data ?? []}
          baseColor="#ca8a04"
          topColor="#fde68a"
        />
      )}
    </div>
  )
}
