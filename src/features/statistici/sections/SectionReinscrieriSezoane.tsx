import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Field, Select, Spinner } from '@/components/ui'
import { listSezoaneTinta, getIncasariPerSezon, getReinscrieriSumar } from '../api'
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

  const sumarQ = useQuery({
    queryKey: ['stat', 'reinscrieri-sumar', sezonTintaId],
    enabled: Boolean(sezonTintaId),
    queryFn: () => getReinscrieriSumar(sezonTintaId),
    ...STAT_QO,
  })

  const incasariSezonQ = useQuery({
    queryKey: ['stat', 'incasari-per-sezon'],
    queryFn: getIncasariPerSezon,
    ...STAT_QO,
  })

  const s = sumarQ.data
  // Campaniile ținute în registre (Excel) au numitorul lor: câți au semnat.
  // Fără registru, singura măsură onestă e pool-ul sezonului trecut.
  const dinRegistre = (s?.semnate ?? 0) > 0

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
        {sumarQ.isLoading ? (
          <Spinner />
        ) : dinRegistre ? (
          <ReinscrieriDonut
            title="Semnatari ajunși în sezon"
            parte={s?.ajunsi ?? 0}
            total={s?.semnate ?? 0}
            parteLabel="Au venit"
            restLabel="Lipsă"
          />
        ) : (
          <ReinscrieriDonut
            title="Reveniți din sezonul trecut"
            parte={s?.pool_revenit ?? 0}
            total={s?.pool_anterior ?? 0}
            parteLabel="Reveniți"
            restLabel="Nereveniți"
            emptyMessage="Sezonul trecut n-are înrolări de comparat."
          />
        )}

        <div className="grid grid-cols-1 gap-3 self-start sm:grid-cols-2">
          {dinRegistre ? (
            <>
              <KpiCard
                label="Au semnat"
                value={s?.semnate ?? 0}
                hint="reînscrieri semnate în registrele campaniei"
              />
              <KpiCard
                label="Au ajuns în sezon"
                value={s?.ajunsi ?? 0}
                tone="positive"
                hint="dintre semnatari, cu înrolare activă"
              />
              <KpiCard
                label="Lipsă"
                value={Math.max(0, (s?.semnate ?? 0) - (s?.ajunsi ?? 0))}
                tone="warning"
                hint="au semnat, dar n-au înrolare"
              />
            </>
          ) : (
            <>
              <KpiCard
                label="Erau în casă"
                value={s?.pool_anterior ?? 0}
                hint="înainte de startul sezonului"
              />
              <KpiCard
                label="Au revenit"
                value={s?.pool_revenit ?? 0}
                tone="positive"
              />
              <KpiCard
                label="Nu s-au întors"
                value={Math.max(
                  0,
                  (s?.pool_anterior ?? 0) - (s?.pool_revenit ?? 0),
                )}
                tone="warning"
              />
            </>
          )}
          <KpiCard
            label="Cu preț promo"
            value={s?.cu_promo ?? 0}
            hint="au prins prețul de reînscriere"
          />
        </div>
      </div>

      {dinRegistre && (
        <p className="mt-3 text-xs text-quasar-gray">
          Retenția întregii școli, pentru comparație: {s?.pool_revenit ?? 0} din{' '}
          {s?.pool_anterior ?? 0} care erau în casă înainte de start (
          {(s?.pool_anterior ?? 0) > 0
            ? Math.round((100 * (s?.pool_revenit ?? 0)) / (s?.pool_anterior ?? 1))
            : 0}
          %). Reînscrierile semnate sunt doar o parte din ea.
        </p>
      )}

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
