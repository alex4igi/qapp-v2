import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { locatiiOptions } from '@/lib/lookups'
import { getLeadFunnel, type Interval } from '../api'
import { FunnelLeadsChart } from '../FunnelLeadsChart'
import { STAT_QO } from './shared'

export function SectionFunnelLeads({ interval }: { interval: Interval }) {
  const [funnelLocatieId, setFunnelLocatieId] = useState('')

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const funnelLocatieLabel = useMemo(
    () => locatiiQ.data?.find((o) => o.value === funnelLocatieId)?.label ?? null,
    [locatiiQ.data, funnelLocatieId],
  )

  const funnelQ = useQuery({
    queryKey: ['stat', 'funnel-leads', interval, funnelLocatieId],
    queryFn: () =>
      getLeadFunnel(interval, funnelLocatieId || null, funnelLocatieLabel),
    ...STAT_QO,
  })

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">
          Funnel leads — conversie & retenție
        </h2>
        <div className="w-56">
          <Field label="Locație" htmlFor="stat-funnel-locatie">
            <Select
              id="stat-funnel-locatie"
              placeholder="Toate locațiile"
              options={locatiiQ.data ?? []}
              value={funnelLocatieId}
              onChange={(e) => setFunnelLocatieId(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {funnelQ.isLoading ? (
        <Spinner />
      ) : (
        <FunnelLeadsChart data={funnelQ.data ?? { global: { leads: 0, contactati: 0, proba: 0, prezenti: 0, convertiti: 0, retentieEligibili: 0, retentie90z: 0 }, perSursa: [] }} />
      )}
    </div>
  )
}
