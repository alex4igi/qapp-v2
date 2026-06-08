import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Field,
  TextInput,
  Select,
  Spinner,
  Button,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import {
  getKpis,
  getBalantaLocatie,
  getBalantaCurs,
  getMixMetode,
  getMixCategoriiIncasari,
  getMixCategoriiCheltuieli,
  getSezonActiv,
  lunaCurenta,
  lunaCuOffset,
  listSezoaneTinta,
  getReinscrieriPierderi,
  getReinscrieriConversie,
  getIncasariPerSezon,
  type Interval,
} from './api'
import { KpiCard } from './KpiCard'
import { BalantaChart } from './BalantaChart'
import { MetodePlataChart } from './MetodePlataChart'
import { CategorieChart } from './CategorieChart'
import { ReinscrieriKpiChart } from './ReinscrieriKpiChart'
import { IncasariSezonChart } from './IncasariSezonChart'

const CATEG_INCASARI_PALETTE: Record<string, string> = {
  Abonament:  '#10b981',
  Bilet:      '#3b82f6',
  Merch:      '#ffd600',
  Taxa:       '#a855f7',
  Necunoscut: '#9ca3af',
}

const CATEG_CHELTUIELI_PALETTE: Record<string, string> = {
  Administrativa: '#f59e0b',
  Salariala:      '#ef4444',
  Alta:           '#6366f1',
  Necunoscut:     '#9ca3af',
}

export function StatisticiPage() {
  const [fromLuna, setFromLuna] = useState(lunaCuOffset(-11))
  const [toLuna, setToLuna] = useState(lunaCurenta())
  const [locatieId, setLocatieId] = useState('')
  const [cursId, setCursId] = useState('')
  const [sezonTintaId, setSezonTintaId] = useState('')

  const interval: Interval = useMemo(() => {
    const f = fromLuna || lunaCuOffset(-11)
    const t = toLuna || lunaCurenta()
    return f > t
      ? { fromLuna: t, toLuna: f }
      : { fromLuna: f, toLuna: t }
  }, [fromLuna, toLuna])

  const kpisQ = useQuery({
    queryKey: ['stat', 'kpis', interval],
    queryFn: () => getKpis(interval),
  })

  const balLocQ = useQuery({
    queryKey: ['stat', 'bal-locatie', interval, locatieId],
    queryFn: () => getBalantaLocatie(interval, locatieId || null),
  })

  const balCursQ = useQuery({
    queryKey: ['stat', 'bal-curs', interval, cursId],
    queryFn: () => getBalantaCurs(interval, cursId || null),
  })

  const metodeQ = useQuery({
    queryKey: ['stat', 'mix-metode', interval],
    queryFn: () => getMixMetode(interval),
  })

  const categIncQ = useQuery({
    queryKey: ['stat', 'categ-incasari', interval],
    queryFn: () => getMixCategoriiIncasari(interval),
  })

  const categChelQ = useQuery({
    queryKey: ['stat', 'categ-cheltuieli', interval],
    queryFn: () => getMixCategoriiCheltuieli(interval),
  })

  const locatiiQ = useQuery({
    queryKey: ['lookup', 'locatii'],
    queryFn: locatiiOptions,
  })

  const cursuriQ = useCursuriOptions({ locatieId: null })

  const sezoaneTintaQ = useQuery({
    queryKey: ['stat', 'sezoane-tinta'],
    queryFn: listSezoaneTinta,
  })

  const sezoaneTintaOptions = useMemo(
    () =>
      (sezoaneTintaQ.data ?? []).map((s) => ({
        value: s.id,
        label: `${s.numele_sezonului} — ${s.stare}`,
      })),
    [sezoaneTintaQ.data],
  )

  useEffect(() => {
    if (!sezonTintaId && sezoaneTintaOptions.length > 0) {
      setSezonTintaId(sezoaneTintaOptions[0].value)
    }
  }, [sezonTintaId, sezoaneTintaOptions])

  const pierderiQ = useQuery({
    queryKey: ['stat', 'reinscrieri-pierderi', sezonTintaId],
    enabled: Boolean(sezonTintaId),
    queryFn: () => getReinscrieriPierderi(sezonTintaId),
  })

  const conversieQ = useQuery({
    queryKey: ['stat', 'reinscrieri-conversie', sezonTintaId],
    enabled: Boolean(sezonTintaId),
    queryFn: () => getReinscrieriConversie(sezonTintaId),
  })

  const incasariSezonQ = useQuery({
    queryKey: ['stat', 'incasari-per-sezon'],
    queryFn: getIncasariPerSezon,
  })

  return (
    <div>
      <PageHeader
        title="Statistici"
        actions={
          <div className="flex items-end gap-3">
            <div className="w-40">
              <Field label="De la luna" htmlFor="stat-from">
                <TextInput
                  id="stat-from"
                  type="month"
                  value={fromLuna}
                  onChange={(e) =>
                    setFromLuna(e.target.value || lunaCuOffset(-11))
                  }
                />
              </Field>
            </div>
            <div className="w-40">
              <Field label="Până la luna" htmlFor="stat-to">
                <TextInput
                  id="stat-to"
                  type="month"
                  value={toLuna}
                  onChange={(e) => setToLuna(e.target.value || lunaCurenta())}
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const sezon = await getSezonActiv()
                if (sezon) {
                  setFromLuna(sezon.fromLuna)
                  setToLuna(sezon.toLuna)
                }
              }}
            >
              Sezon curent
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Încasări"
          value={kpisQ.data ? formatRON(kpisQ.data.incasari) : '—'}
          tone="positive"
          hint="în intervalul ales"
        />
        <KpiCard
          label="Cheltuieli"
          value={kpisQ.data ? formatRON(kpisQ.data.cheltuieli) : '—'}
          tone="negative"
          hint="cu deadline în interval"
        />
        <KpiCard
          label="Profit"
          value={kpisQ.data ? formatRON(kpisQ.data.profit) : '—'}
          tone={
            kpisQ.data && kpisQ.data.profit < 0 ? 'negative' : 'positive'
          }
          hint="încasări − cheltuieli"
        />
        <KpiCard
          label="Restanțe"
          value={kpisQ.data ? formatRON(kpisQ.data.restanteTotal) : '—'}
          tone="warning"
          hint="total de recuperat (toate)"
        />
      </div>

      <div className="flex flex-col gap-4">
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-quasar-black">
              Mix metode de plată
            </h2>
            {metodeQ.isLoading ? (
              <Spinner />
            ) : (
              <MetodePlataChart rows={metodeQ.data ?? []} />
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-quasar-black">
              Încasări pe categorie
            </h2>
            {categIncQ.isLoading ? (
              <Spinner />
            ) : (
              <CategorieChart
                title="Distribuție încasări"
                rows={categIncQ.data ?? []}
                palette={CATEG_INCASARI_PALETTE}
              />
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-quasar-black">
              Cheltuieli pe categorie
            </h2>
            {categChelQ.isLoading ? (
              <Spinner />
            ) : (
              <CategorieChart
                title="Distribuție cheltuieli"
                rows={categChelQ.data ?? []}
                palette={CATEG_CHELTUIELI_PALETTE}
              />
            )}
          </div>
        </div>

        <div className="mt-8 border-t border-quasar-gray-light pt-6">
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
                    onChange={(e) => setSezonTintaId(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>

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

          <div className="mt-4">
            {incasariSezonQ.isLoading ? (
              <Spinner />
            ) : (
              <IncasariSezonChart rows={incasariSezonQ.data ?? []} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
