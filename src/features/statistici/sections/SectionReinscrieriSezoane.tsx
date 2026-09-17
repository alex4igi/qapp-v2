import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { getReinscrieriProgress } from '@/features/reinscrieri/api'
import { listSezoaneTinta, getIncasariPerSezon } from '../api'
import { KpiCard } from '../KpiCard'
import { ReinscrieriDonut } from '../ReinscrieriDonut'
import { IncasariSezonChart } from '../IncasariSezonChart'
import { STAT_QO } from './shared'

export function SectionReinscrieriSezoane() {
  const [sezonTintaAles, setSezonTintaAles] = useState('')

  const sezoaneTintaQ = useQuery({
    queryKey: ['stat', 'sezoane-tinta'],
    queryFn: listSezoaneTinta,
    ...STAT_QO,
  })

  const sezoaneTintaOptions = useMemo(
    () =>
      (sezoaneTintaQ.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.numele_sezonului} — ${s.stare}`,
      })),
    [sezoaneTintaQ.data],
  )

  // Default = primul sezon eligibil, ca valoare derivată (fără efect + re-render).
  const sezonTintaId = sezonTintaAles || sezoaneTintaOptions[0]?.value || ''

  const reinscrieriProgresQ = useQuery({
    queryKey: ['stat', 'reinscrieri-progres', sezonTintaId],
    enabled: Boolean(sezonTintaId),
    queryFn: () => getReinscrieriProgress(sezonTintaId),
    ...STAT_QO,
  })

  const { potential, reinscrisi } = useMemo(() => {
    const rows = reinscrieriProgresQ.data ?? []
    return {
      potential: rows.reduce((a, r) => a + Number(r.total_eligibili ?? 0), 0),
      reinscrisi: rows.reduce((a, r) => a + Number(r.activati ?? 0), 0),
    }
  }, [reinscrieriProgresQ.data])

  const incasariSezonQ = useQuery({
    queryKey: ['stat', 'incasari-per-sezon'],
    queryFn: getIncasariPerSezon,
    ...STAT_QO,
  })

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-base font-bold text-quasar-black">
          Reînscrieri & Sezoane
        </h2>
        <div className="w-72">
          <Field label="Sezon țintă" htmlFor="stat-sez-tinta">
            {sezoaneTintaQ.isLoading ? (
              <Spinner />
            ) : sezoaneTintaOptions.length === 0 ? (
              <p className="text-sm text-quasar-gray">
                Niciun sezon principal eligibil.
              </p>
            ) : (
              <Select
                id="stat-sez-tinta"
                options={sezoaneTintaOptions}
                value={sezonTintaId}
                onChange={(e) => setSezonTintaAles(e.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {reinscrieriProgresQ.isLoading ? (
          <Spinner />
        ) : (
          <ReinscrieriDonut reinscrisi={reinscrisi} potential={potential} />
        )}
        <div className="grid grid-cols-1 gap-3 self-start sm:grid-cols-2">
          <KpiCard label="Potențial (eligibili)" value={potential} />
          <KpiCard label="Reînscriși" value={reinscrisi} tone="positive" />
          <KpiCard
            label="Rămași"
            value={Math.max(0, potential - reinscrisi)}
          />
          <KpiCard
            label="Rată reînscriere"
            value={
              potential > 0
                ? `${Math.round((100 * reinscrisi) / potential)}%`
                : '—'
            }
            tone="positive"
          />
        </div>
      </div>

      <div className="mt-4">
        {incasariSezonQ.isLoading ? (
          <Spinner />
        ) : (
          <IncasariSezonChart rows={incasariSezonQ.data ?? []} />
        )}
      </div>
    </div>
  )
}
