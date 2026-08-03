import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { getBalantaCurs, type Interval } from '../api'
import { BalantaChart } from '../BalantaChart'
import { STAT_QO } from './shared'

export function SectionBalantaCurs({ interval }: { interval: Interval }) {
  const [cursId, setCursId] = useState('')

  const cursuriQ = useCursuriOptions({ locatieId: null })

  const balCursQ = useQuery({
    queryKey: ['stat', 'bal-curs', interval, cursId],
    queryFn: () => getBalantaCurs(interval, cursId || null),
    ...STAT_QO,
  })

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">
          Balanță curs
        </h2>
        <div className="w-64">
          <Field label="Curs" htmlFor="stat-curs">
            <Select
              id="stat-curs"
              placeholder="Toate cursurile"
              options={cursuriQ.data ?? []}
              value={cursId}
              onChange={(e) => setCursId(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {balCursQ.isLoading ? (
        <Spinner />
      ) : (
        <BalantaChart
          title={
            cursId
              ? cursuriQ.data?.find((o) => o.value === cursId)?.label ??
                'Cursul selectat'
              : 'Toate cursurile'
          }
          rows={balCursQ.data ?? []}
          baseColor="#1d4ed8"
          topColor="#bfdbfe"
        />
      )}
    </div>
  )
}
