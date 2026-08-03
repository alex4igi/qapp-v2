import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { locatiiOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import { getStatisticaPrezenteAchitare, type Interval } from '../api'
import { PrezenteAchitareChart } from '../PrezenteAchitareChart'
import { STAT_QO } from './shared'

export function SectionPrezenteAchitare({ interval }: { interval: Interval }) {
  const [prezLocatieId, setPrezLocatieId] = useState('')
  const [prezTeacherId, setPrezTeacherId] = useState('')
  const [prezCursId, setPrezCursId] = useState('')

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })
  const teacheriQ = useTeacheriOptions({ locatieId: null })
  const cursuriQ = useCursuriOptions({ locatieId: null })

  const prezAchitareQ = useQuery({
    queryKey: ['stat', 'prezente-achitare', interval, prezLocatieId, prezTeacherId, prezCursId],
    queryFn: () =>
      getStatisticaPrezenteAchitare(
        interval,
        prezLocatieId || null,
        prezTeacherId || null,
        prezCursId || null,
      ),
    ...STAT_QO,
  })

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">
          Prezențe pe achitare
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Field label="Locație" htmlFor="stat-prez-locatie">
              <Select
                id="stat-prez-locatie"
                placeholder="Toate locațiile"
                options={locatiiQ.data ?? []}
                value={prezLocatieId}
                onChange={(e) => setPrezLocatieId(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Instructor" htmlFor="stat-prez-teacher">
              <Select
                id="stat-prez-teacher"
                placeholder="Toți instructorii"
                options={teacheriQ.data ?? []}
                value={prezTeacherId}
                onChange={(e) => setPrezTeacherId(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Grupă" htmlFor="stat-prez-curs">
              <Select
                id="stat-prez-curs"
                placeholder="Toate grupele"
                options={cursuriQ.data ?? []}
                value={prezCursId}
                onChange={(e) => setPrezCursId(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>
      {prezAchitareQ.isLoading ? (
        <Spinner />
      ) : (
        <PrezenteAchitareChart
          title="Prezențe achitate / neachitate / din trecut pe lună"
          note={
            '„Achitate din trecut” = ședințe mai vechi (până la 24 de luni în urmă) ' +
            'a căror înrolare s-a achitat integral în luna respectivă — ' +
            'inclusiv ședințe dinaintea intervalului ales.'
          }
          rows={prezAchitareQ.data ?? []}
        />
      )}
    </div>
  )
}
