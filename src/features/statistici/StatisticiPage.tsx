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
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import {
  getKpis,
  getBalantaLocatie,
  getBalantaCurs,
  getMixMetode,
  getMixCategoriiIncasari,
  getMixCategoriiCheltuieli,
  getStatisticaPrezenteAchitare,
  getSezonActiv,
  lunaCurenta,
  lunaCuOffset,
  listSezoaneTinta,
  getIncasariPerSezon,
  getRataPrezentaLuna,
  getOcupareTotala,
  getRetentieLuna,
  getVenitLunaCurenta,
  type Interval,
} from './api'
import { getReinscrieriProgress } from '@/features/reinscrieri/api'
import { KpiCard } from './KpiCard'
import { OverviewDonut } from './OverviewDonut'
import { BalantaChart } from './BalantaChart'
import { PrezenteAchitareChart } from './PrezenteAchitareChart'
import { MetodePlataChart } from './MetodePlataChart'
import { CategorieChart } from './CategorieChart'
import { ReinscrieriDonut } from './ReinscrieriDonut'
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
  const [prezLocatieId, setPrezLocatieId] = useState('')
  const [prezTeacherId, setPrezTeacherId] = useState('')
  const [sezonTintaId, setSezonTintaId] = useState('')

  const interval: Interval = useMemo(() => {
    const f = fromLuna || lunaCuOffset(-11)
    const t = toLuna || lunaCurenta()
    return f > t
      ? { fromLuna: t, toLuna: f }
      : { fromLuna: f, toLuna: t }
  }, [fromLuna, toLuna])

  const lunaLabel = useMemo(() => {
    const [y, m] = lunaCurenta().split('-').map(Number)
    return new Intl.DateTimeFormat('ro-RO', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(y, m - 1, 1))
  }, [])

  const kpisQ = useQuery({
    queryKey: ['stat', 'kpis', interval],
    queryFn: () => getKpis(interval),
  })

  // Overview „luna curentă" — independent de selectorul de interval
  const rataPrezentaQ = useQuery({
    queryKey: ['stat', 'rata-prezenta'],
    queryFn: getRataPrezentaLuna,
  })
  const ocupareTotalaQ = useQuery({
    queryKey: ['stat', 'ocupare-totala'],
    queryFn: getOcupareTotala,
  })
  const retentieQ = useQuery({
    queryKey: ['stat', 'retentie'],
    queryFn: getRetentieLuna,
  })
  const venitLunaQ = useQuery({
    queryKey: ['stat', 'venit-luna'],
    queryFn: getVenitLunaCurenta,
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

  const teacheriQ = useTeacheriOptions({ locatieId: null })

  const cursuriQ = useCursuriOptions({ locatieId: null })

  const prezAchitareQ = useQuery({
    queryKey: ['stat', 'prezente-achitare', interval, prezLocatieId, prezTeacherId],
    queryFn: () =>
      getStatisticaPrezenteAchitare(
        interval,
        prezLocatieId || null,
        prezTeacherId || null,
      ),
  })

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

  const reinscrieriProgresQ = useQuery({
    queryKey: ['stat', 'reinscrieri-progres', sezonTintaId],
    enabled: Boolean(sezonTintaId),
    queryFn: () => getReinscrieriProgress(sezonTintaId),
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

      <div className="mb-8">
        <h2 className="mb-3 text-base font-bold text-quasar-black">
          Privire de ansamblu — {lunaLabel}
        </h2>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Venit luna curentă"
            value={venitLunaQ.data != null ? formatRON(venitLunaQ.data) : '—'}
            tone="positive"
            hint="încasări în luna în curs"
          />
          <KpiCard
            label="Rată prezență"
            value={
              rataPrezentaQ.data ? `${rataPrezentaQ.data.global.rata}%` : '—'
            }
            hint="prezenți / roster (recurent)"
          />
          <KpiCard
            label="Ocupare grupe"
            value={
              ocupareTotalaQ.data ? `${ocupareTotalaQ.data.procent}%` : '—'
            }
            hint="total ocupat / capacitate"
          />
          <KpiCard
            label="Retenție"
            value={retentieQ.data ? `${retentieQ.data.rata}%` : '—'}
            tone="positive"
            hint="membri păstrați vs luna trecută"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            {rataPrezentaQ.isLoading ? (
              <Spinner />
            ) : (
              <OverviewDonut
                title="Rată prezență"
                percent={rataPrezentaQ.data?.global.rata ?? 0}
                centerSub={
                  rataPrezentaQ.data
                    ? `${rataPrezentaQ.data.global.prezenti} din ${rataPrezentaQ.data.global.posibile}`
                    : undefined
                }
                slices={[
                  {
                    name: 'Prezenți',
                    value: rataPrezentaQ.data?.global.prezenti ?? 0,
                  },
                  {
                    name: 'Lipsă',
                    value: Math.max(
                      0,
                      (rataPrezentaQ.data?.global.posibile ?? 0) -
                        (rataPrezentaQ.data?.global.prezenti ?? 0),
                    ),
                  },
                ]}
                emptyMessage="Nicio prezență marcată luna aceasta."
              >
                {rataPrezentaQ.data &&
                  rataPrezentaQ.data.perLocatie.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-quasar-gray-light pt-3 text-sm">
                      {rataPrezentaQ.data.perLocatie.map((l) => (
                        <li
                          key={l.nume}
                          className="flex justify-between gap-2"
                        >
                          <span className="text-quasar-gray">{l.nume}</span>
                          <span className="font-medium text-quasar-black">
                            {l.rata}%{' '}
                            <span className="text-xs font-normal text-quasar-gray">
                              ({l.prezenti}/{l.posibile})
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
              </OverviewDonut>
            )}
          </div>

          <div>
            {ocupareTotalaQ.isLoading ? (
              <Spinner />
            ) : (
              <OverviewDonut
                title="Grad de ocupare grupe"
                percent={ocupareTotalaQ.data?.procent ?? 0}
                centerSub={
                  ocupareTotalaQ.data
                    ? `${ocupareTotalaQ.data.activi} din ${ocupareTotalaQ.data.capacitate}`
                    : undefined
                }
                slices={[
                  { name: 'Ocupat', value: ocupareTotalaQ.data?.activi ?? 0 },
                  {
                    name: 'Liber',
                    value: Math.max(
                      0,
                      (ocupareTotalaQ.data?.capacitate ?? 0) -
                        (ocupareTotalaQ.data?.activi ?? 0),
                    ),
                  },
                ]}
              />
            )}
          </div>

          <div>
            {retentieQ.isLoading ? (
              <Spinner />
            ) : (
              <OverviewDonut
                title="Retenție membri"
                percent={retentieQ.data?.rata ?? 0}
                centerSub={
                  retentieQ.data
                    ? `${retentieQ.data.retinuti} din ${retentieQ.data.bazaPrev}`
                    : undefined
                }
                slices={[
                  { name: 'Reținuți', value: retentieQ.data?.retinuti ?? 0 },
                  { name: 'Pierduți', value: retentieQ.data?.pierduti ?? 0 },
                ]}
                emptyMessage="Fără bază de comparație luna trecută."
              />
            )}
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-base font-bold text-quasar-black">
        Financiar — interval ales
      </h2>
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
          hint="făcute în interval"
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
            </div>
          </div>
          {prezAchitareQ.isLoading ? (
            <Spinner />
          ) : (
            <PrezenteAchitareChart
              title="Prezențe achitate / neachitate / din trecut pe lună"
              rows={prezAchitareQ.data ?? []}
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
      </div>
    </div>
  )
}
