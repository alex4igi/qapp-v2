import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PageHeader,
  Field,
  MonthPicker,
  Select,
  Spinner,
  Button,
} from '@/components/ui'
import { formatRON } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { useWorkingLocatie } from '@/hooks/useWorkingLocatie'
import { isPrivileged, isAdminOrHigher } from '@/lib/rolesMatrix'
import { locatiiOptions } from '@/lib/lookups'
import { useCursuriOptions } from '@/hooks/useCursuriOptions'
import { useTeacheriOptions } from '@/hooks/useTeacheriOptions'
import {
  getKpis,
  getBalantaLocatie,
  getBalantaCurs,
  getBalantaTeacher,
  getMixMetode,
  getMixCategoriiIncasari,
  getMixCategoriiCheltuieli,
  getStatisticaPrezenteAchitare,
  getSezonActiv,
  lunaCurenta,
  lunaCuOffset,
  listSezoaneTinta,
  getIncasariPerSezon,
  getLeadFunnel,
  type Interval,
} from './api'
import {
  getTrendPrezente,
  getGradOcupare,
  getCrestereNeta,
  getConversieLeads,
  getProfitabilitateTeacher,
} from '@/features/ansamblu/api'
import { TrendPrezenteSection } from '@/features/ansamblu/TrendPrezenteSection'
import { TotalClientiChart } from '@/features/ansamblu/TotalClientiChart'
import { OcupareList } from '@/features/ansamblu/OcupareList'
import { TeacherMarjaTable } from '@/features/ansamblu/TeacherMarjaTable'
import { getReinscrieriProgress } from '@/features/reinscrieri/api'
import { KpiCard } from './KpiCard'
import { BalantaChart } from './BalantaChart'
import { PrezenteAchitareChart } from './PrezenteAchitareChart'
import { MetodePlataChart } from './MetodePlataChart'
import { CategorieChart } from './CategorieChart'
import { ReinscrieriDonut } from './ReinscrieriDonut'
import { IncasariSezonChart } from './IncasariSezonChart'
import { FunnelLeadsChart } from './FunnelLeadsChart'
import { TeacherOverviewSection } from './TeacherOverviewSection'

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
  const { role } = useAuth()
  // Cheltuieli + profit sunt doar pentru manager+. Front_desk vede încasări,
  // restanțe, conversie, prezențe, ocupare — „satisfacția muncii", fără profit.
  const privileged = isPrivileged(role)
  const { locatieId: scopLocatie, locatieNume: scopLocatieNume } =
    useWorkingLocatie()
  const [fromLuna, setFromLuna] = useState(lunaCuOffset(-11))
  const [toLuna, setToLuna] = useState(lunaCurenta())
  const [locatieId, setLocatieId] = useState('')
  const [cursId, setCursId] = useState('')
  const [teacherBalId, setTeacherBalId] = useState('')
  const [prezLocatieId, setPrezLocatieId] = useState('')
  const [prezTeacherId, setPrezTeacherId] = useState('')
  const [prezCursId, setPrezCursId] = useState('')
  const [funnelLocatieId, setFunnelLocatieId] = useState('')
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

  // Operațional (mutat din Overview) — luna curentă, scope pe locația de lucru.
  const trendQ = useQuery({
    queryKey: ['stat', 'trend', scopLocatie],
    queryFn: () => getTrendPrezente(scopLocatie),
  })
  const ocupareQ = useQuery({
    queryKey: ['stat', 'ocupare', scopLocatie],
    queryFn: () => getGradOcupare(scopLocatie),
  })
  const crestereQ = useQuery({
    queryKey: ['stat', 'crestere-neta', scopLocatie],
    queryFn: () => getCrestereNeta(scopLocatie, 12),
    enabled: privileged,
  })
  const conversieQ = useQuery({
    queryKey: ['stat', 'conversie-leads'],
    queryFn: () => getConversieLeads(12),
    enabled: privileged,
  })
  const profitQ = useQuery({
    queryKey: ['stat', 'profit-teacher'],
    queryFn: () => getProfitabilitateTeacher(12),
    enabled: isAdminOrHigher(role),
  })

  const balLocQ = useQuery({
    queryKey: ['stat', 'bal-locatie', interval, locatieId],
    queryFn: () => getBalantaLocatie(interval, locatieId || null),
  })

  const balCursQ = useQuery({
    queryKey: ['stat', 'bal-curs', interval, cursId],
    queryFn: () => getBalantaCurs(interval, cursId || null),
  })
  const balTeacherQ = useQuery({
    queryKey: ['stat', 'bal-teacher', interval, teacherBalId],
    queryFn: () => getBalantaTeacher(interval, teacherBalId || null),
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
    enabled: privileged,
  })

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
  })

  const funnelLocatieLabel = useMemo(
    () => locatiiQ.data?.find((o) => o.value === funnelLocatieId)?.label ?? null,
    [locatiiQ.data, funnelLocatieId],
  )

  const funnelQ = useQuery({
    queryKey: ['stat', 'funnel-leads', interval, funnelLocatieId],
    queryFn: () =>
      getLeadFunnel(interval, funnelLocatieId || null, funnelLocatieLabel),
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
            <div className="w-44">
              <Field label="De la luna" htmlFor="stat-from">
                <MonthPicker
                  id="stat-from"
                  value={fromLuna}
                  onChange={(v) => setFromLuna(v || lunaCuOffset(-11))}
                />
              </Field>
            </div>
            <div className="w-44">
              <Field label="Până la luna" htmlFor="stat-to">
                <MonthPicker
                  id="stat-to"
                  value={toLuna}
                  onChange={(v) => setToLuna(v || lunaCurenta())}
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
        {privileged && (
          <KpiCard
            label="Cheltuieli"
            value={kpisQ.data ? formatRON(kpisQ.data.cheltuieli) : '—'}
            tone="negative"
            hint="făcute în interval"
          />
        )}
        {isAdminOrHigher(role) && (
          <KpiCard
            label="Profit"
            value={kpisQ.data ? formatRON(kpisQ.data.profit) : '—'}
            tone={
              kpisQ.data && kpisQ.data.profit < 0 ? 'negative' : 'positive'
            }
            hint="încasări − cheltuieli"
          />
        )}
        <KpiCard
          label="Restanțe"
          value={kpisQ.data ? formatRON(kpisQ.data.restanteTotal) : '—'}
          tone="warning"
          hint="de recuperat (înrolări din interval, fără prescrise)"
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
          <div className="mb-2 flex items-end justify-between gap-3">
            <h2 className="text-sm font-semibold text-quasar-black">
              Balanță teacher
            </h2>
            <div className="w-64">
              <Field label="Instructor" htmlFor="stat-teacher-bal">
                <Select
                  id="stat-teacher-bal"
                  placeholder="Toți instructorii"
                  options={teacheriQ.data ?? []}
                  value={teacherBalId}
                  onChange={(e) => setTeacherBalId(e.target.value)}
                />
              </Field>
            </div>
          </div>
          {balTeacherQ.isLoading ? (
            <Spinner />
          ) : (
            <BalantaChart
              title={
                teacherBalId
                  ? teacheriQ.data?.find((o) => o.value === teacherBalId)
                      ?.label ?? 'Instructorul selectat'
                  : 'Toți instructorii'
              }
              rows={balTeacherQ.data ?? []}
              baseColor="#15803d"
              topColor="#bbf7d0"
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
              rows={prezAchitareQ.data ?? []}
            />
          )}
        </div>

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
          {privileged && (
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
          )}
        </div>

        <div className="mt-8 border-t border-gray-200 pt-6">
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

      <div className="mt-8 flex flex-col gap-8 border-t border-quasar-gray-light pt-6">
        <h2 className="text-base font-bold text-quasar-black">
          Operațional — {scopLocatieNume ?? 'toate locațiile'}
        </h2>

        {trendQ.isLoading ? (
          <Spinner />
        ) : (
          <TrendPrezenteSection rows={trendQ.data ?? []} />
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-quasar-black">
            Grad de ocupare cursuri
          </h2>
          <p className="mb-3 text-xs text-quasar-gray">
            Înscriși activi luna asta / capacitate.{' '}
            <span className="text-green-700">verde</span> bine ocupat ·{' '}
            <span className="text-amber-600">galben</span> loc disponibil ·{' '}
            <span className="text-red-600">roșu</span> peste capacitate.
          </p>
          {ocupareQ.isLoading ? (
            <Spinner />
          ) : (
            <OcupareList rows={ocupareQ.data ?? []} />
          )}
        </section>

        <TeacherOverviewSection />

        {privileged && (
          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <h2 className="text-sm font-semibold text-quasar-black">
                Total clienți (ultimele 12 luni)
              </h2>
              <span className="text-xs text-quasar-gray">
                {scopLocatieNume ?? 'toate locațiile'}
              </span>
            </div>
            {crestereQ.isLoading ? (
              <Spinner />
            ) : (
              <TotalClientiChart rows={crestereQ.data ?? []} />
            )}
          </section>
        )}

        {privileged && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-quasar-black">
              Conversie lead → client (ultimele 12 luni)
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Lead-uri intrate"
                value={conversieQ.data?.total_leads ?? '—'}
              />
              <KpiCard
                label="Convertiți"
                value={conversieQ.data?.convertiti ?? '—'}
                tone="positive"
              />
              <KpiCard
                label="Rată conversie"
                value={conversieQ.data ? `${conversieQ.data.procent}%` : '—'}
                tone="positive"
              />
              <KpiCard
                label="Zile medii până la conversie"
                value={conversieQ.data?.zile_medii ?? '—'}
              />
            </div>
          </section>
        )}

        {isAdminOrHigher(role) && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-quasar-black">
              Profitabilitate instructori (ultimele 12 luni)
            </h2>
            <p className="mb-3 text-xs text-quasar-gray">
              Încasări atribuite cursurilor instructorului minus salariu. Vizibil
              doar pentru owner și admin.
            </p>
            {profitQ.isLoading ? (
              <Spinner />
            ) : (
              <TeacherMarjaTable rows={profitQ.data ?? []} />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
