import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import {
  listSezoaneTinta,
  getReinscrieriPierderi,
  getReinscrieriConversie,
} from '@/features/statistici/api'
import { ReinscrieriKpiChart } from '@/features/statistici/ReinscrieriKpiChart'

export function ReinscrieriSection() {
  const [sezonTintaId, setSezonTintaId] = useState('')

  const sezoaneTintaQ = useQuery({
    queryKey: ['ansamblu', 'sezoane-tinta'],
    queryFn: listSezoaneTinta,
  })

  const sezoaneOptions = useMemo(
    () =>
      (sezoaneTintaQ.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.numele_sezonului} — ${s.stare}`,
      })),
    [sezoaneTintaQ.data],
  )

  useEffect(() => {
    if (!sezonTintaId && sezoaneOptions.length > 0) {
      setSezonTintaId(sezoaneOptions[0].value)
    }
  }, [sezonTintaId, sezoaneOptions])

  const pierderiQ = useQuery({
    queryKey: ['ansamblu', 'reinscrieri-pierderi', sezonTintaId],
    enabled: Boolean(sezonTintaId),
    queryFn: () => getReinscrieriPierderi(sezonTintaId),
  })

  const conversieQ = useQuery({
    queryKey: ['ansamblu', 'reinscrieri-conversie', sezonTintaId],
    enabled: Boolean(sezonTintaId),
    queryFn: () => getReinscrieriConversie(sezonTintaId),
  })

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-quasar-black">Reînscrieri</h2>
        <div className="w-64">
          <Field label="Sezon țintă" htmlFor="ansamblu-sez-tinta">
            {sezoaneTintaQ.isLoading ? (
              <Spinner />
            ) : sezoaneOptions.length === 0 ? (
              <p className="text-sm text-quasar-gray">
                Niciun sezon principal eligibil.
              </p>
            ) : (
              <Select
                id="ansamblu-sez-tinta"
                options={sezoaneOptions}
                value={sezonTintaId}
                onChange={(e) => setSezonTintaId(e.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

      {sezoaneOptions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            {pierderiQ.isLoading ? (
              <Spinner />
            ) : (
              <ReinscrieriKpiChart
                title="Pierderi promo (anulări cron)"
                rows={pierderiQ.data ?? []}
                baseKey="activati_curent"
                baseLabel="Activi"
                baseColor="#10b981"
                topKey="pierduti"
                topLabel="Pierduți"
                topColor="#ef4444"
                percentKey="procent_pierdere"
                percentSuffix="% pierdere"
              />
            )}
          </div>
          <div>
            {conversieQ.isLoading ? (
              <Spinner />
            ) : (
              <ReinscrieriKpiChart
                title="Conversie reînscriere → plată"
                rows={(conversieQ.data ?? []).map((r) => ({
                  ...r,
                  neplatiti: Math.max(0, r.activati - r.platiti),
                }))}
                baseKey="platiti"
                baseLabel="Plătiți"
                baseColor="#3b82f6"
                topKey="neplatiti"
                topLabel="Neplătiți încă"
                topColor="#dbeafe"
                percentKey="procent_conversie"
                percentSuffix="% conversie"
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}
