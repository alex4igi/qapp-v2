import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Field, MonthPicker, Select, Spinner, Button } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import {
  getKpis,
  getMixMetode,
  getMixCategoriiIncasari,
  getLeadFunnel,
  getRetentieLuna,
  getRataPrezentaLuna,
  getIncasariPerSezon,
  getSezonActiv,
  lunaCurenta,
  lunaCuOffset,
  type Interval,
} from '@/features/statistici/api'
import {
  getCrestereNeta,
  getGradOcupare,
  getConversieLeads,
  getProfitabilitateTeacher,
  getTrendPrezente,
  getClientiActivi,
} from '@/features/ansamblu/api'
import { KpiCard } from '@/features/statistici/KpiCard'
import { OverviewDonut } from '@/features/statistici/OverviewDonut'
import { CategorieChart } from '@/features/statistici/CategorieChart'
import { MetodePlataChart } from '@/features/statistici/MetodePlataChart'
import { FunnelLeadsChart } from '@/features/statistici/FunnelLeadsChart'
import { IncasariSezonChart } from '@/features/statistici/IncasariSezonChart'
import { TotalClientiChart } from '@/features/ansamblu/TotalClientiChart'
import { OcupareList } from '@/features/ansamblu/OcupareList'
import { TeacherMarjaTable } from '@/features/ansamblu/TeacherMarjaTable'
import { TrendPrezenteSection } from '@/features/ansamblu/TrendPrezenteSection'
import {
  getRestanteTotale,
  getRetentieCohorte,
  getDurataMedieLtv,
  getLeadsPeLuna,
  getAbsenteConsecutive,
  getRestanteAging,
  getOcuparePrimeTime,
  getRentabilitateGrupa,
  getArpuTrend,
  getMixRecurentOneoff,
  getInstructoriClientiTrend,
  getYoYAceeasiLuna,
  getCursantiMultiStil,
  getFamiliiFrati,
  getMrrTrend,
  getColectareDso,
} from './api'
import { MrrTrendChart } from './MrrTrendChart'
import { BreakEvenTable } from './BreakEvenTable'
import { InstructoriTrendCard } from './InstructoriTrendCard'
import { RetentieCohorteTable } from './RetentieCohorteTable'
import { RestanteAgingChart } from './RestanteAgingChart'
import { AbsenteConsecutiveTable } from './AbsenteConsecutiveTable'
import { OcuparePrimeTimeChart } from './OcuparePrimeTimeChart'
import { ArpuTrendChart } from './ArpuTrendChart'
import { YoYChart } from './YoYChart'
import { RentabilitateGrupaTable } from './RentabilitateGrupaTable'
import { FluxChart, LeadsLunaChart } from './MiniCharts'

const CATEG_INCASARI_PALETTE: Record<string, string> = {
  Abonament: '#10b981',
  Bilet: '#3b82f6',
  Merch: '#ffd600',
  Taxa: '#a855f7',
  Workshop: '#ec4899',
  Auditie: '#14b8a6',
  Necunoscut: '#9ca3af',
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-bold text-quasar-black">{children}</h2>
      {sub && <p className="text-xs text-quasar-gray">{sub}</p>}
    </div>
  )
}

export function AnalyticsPage() {
  const [fromLuna, setFromLuna] = useState(lunaCuOffset(-11))
  const [toLuna, setToLuna] = useState(lunaCurenta())
  const [locatieId, setLocatieId] = useState('')
  const [yoyMetrica, setYoyMetrica] = useState<'venit' | 'activi'>('venit')
  const [showCfo, setShowCfo] = useState(false)

  const anCurent = new Date().getFullYear()

  const interval: Interval = useMemo(() => {
    const f = fromLuna || lunaCuOffset(-11)
    const t = toLuna || lunaCurenta()
    return f > t ? { fromLuna: t, toLuna: f } : { fromLuna: f, toLuna: t }
  }, [fromLuna, toLuna])

  const locatiiQ = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })
  const locatieLabel = useMemo(
    () => locatiiQ.data?.find((o) => o.value === locatieId)?.label ?? null,
    [locatiiQ.data, locatieId],
  )
  const scope = locatieId || null

  // ── KPI band (stare curentă + interval) ────────────────────────────────────
  const kpisQ = useQuery({ queryKey: ['an', 'kpis', interval], queryFn: () => getKpis(interval) })
  const activiQ = useQuery({ queryKey: ['an', 'activi'], queryFn: getClientiActivi })
  const restanteQ = useQuery({ queryKey: ['an', 'restante', scope], queryFn: () => getRestanteTotale(scope) })
  const prezLunaQ = useQuery({ queryKey: ['an', 'rata-prezenta'], queryFn: getRataPrezentaLuna })
  const conversieQ = useQuery({ queryKey: ['an', 'conversie'], queryFn: () => getConversieLeads(12) })

  // ── 1. Retenție & churn ─────────────────────────────────────────────────────
  const crestereQ = useQuery({ queryKey: ['an', 'crestere', scope], queryFn: () => getCrestereNeta(scope, 12) })
  const retentieQ = useQuery({ queryKey: ['an', 'retentie'], queryFn: getRetentieLuna })
  const cohorteQ = useQuery({ queryKey: ['an', 'cohorte'], queryFn: () => getRetentieCohorte(null) })
  const ltvQ = useQuery({ queryKey: ['an', 'ltv', scope], queryFn: () => getDurataMedieLtv(scope) })

  // ── 2. Achiziție ────────────────────────────────────────────────────────────
  const funnelQ = useQuery({
    queryKey: ['an', 'funnel', interval, locatieId],
    queryFn: () => getLeadFunnel(interval, scope, locatieLabel),
  })
  const leadsLunaQ = useQuery({
    queryKey: ['an', 'leads-luna', interval, locatieLabel],
    queryFn: () => getLeadsPeLuna(interval, locatieLabel),
  })

  // ── 3. Risc timpuriu ────────────────────────────────────────────────────────
  const absenteQ = useQuery({ queryKey: ['an', 'absente', scope], queryFn: () => getAbsenteConsecutive(scope, 2) })
  const agingQ = useQuery({ queryKey: ['an', 'aging', scope], queryFn: () => getRestanteAging(scope) })
  const trendQ = useQuery({ queryKey: ['an', 'trend', scope], queryFn: () => getTrendPrezente(scope) })

  // ── 4. Economia grupelor ────────────────────────────────────────────────────
  const ocupareQ = useQuery({ queryKey: ['an', 'ocupare', scope], queryFn: () => getGradOcupare(scope) })
  const primeTimeQ = useQuery({ queryKey: ['an', 'prime-time', scope], queryFn: () => getOcuparePrimeTime(scope) })
  const rentabQ = useQuery({ queryKey: ['an', 'rentab-grupa'], queryFn: () => getRentabilitateGrupa(12) })

  // ── 5. Calitatea veniturilor ────────────────────────────────────────────────
  const arpuQ = useQuery({ queryKey: ['an', 'arpu', interval, scope], queryFn: () => getArpuTrend(interval, scope) })
  const recurentQ = useQuery({ queryKey: ['an', 'recurent', interval], queryFn: () => getMixRecurentOneoff(interval) })
  const metodeQ = useQuery({ queryKey: ['an', 'metode', interval], queryFn: () => getMixMetode(interval) })
  const categIncQ = useQuery({ queryKey: ['an', 'categ-inc', interval], queryFn: () => getMixCategoriiIncasari(interval) })

  // ── 6. Oameni ────────────────────────────────────────────────────────────────
  const instructoriQ = useQuery({ queryKey: ['an', 'instructori'], queryFn: () => getInstructoriClientiTrend(6) })
  const profitQ = useQuery({ queryKey: ['an', 'profit-teacher'], queryFn: () => getProfitabilitateTeacher(12) })

  // ── 7. Școală de dans ────────────────────────────────────────────────────────
  const yoyQ = useQuery({ queryKey: ['an', 'yoy', yoyMetrica, scope], queryFn: () => getYoYAceeasiLuna(yoyMetrica, scope) })
  const multiStilQ = useQuery({ queryKey: ['an', 'multi-stil'], queryFn: getCursantiMultiStil })
  const fratiQ = useQuery({ queryKey: ['an', 'frati'], queryFn: getFamiliiFrati })
  const incasariSezonQ = useQuery({ queryKey: ['an', 'incasari-sezon'], queryFn: getIncasariPerSezon })

  // ── CFO pack (lazy — doar când e expandat) ───────────────────────────────────
  const mrrQ = useQuery({ queryKey: ['an', 'mrr', scope], queryFn: () => getMrrTrend(12, scope), enabled: showCfo })
  const colectareQ = useQuery({ queryKey: ['an', 'colectare', interval], queryFn: () => getColectareDso(interval), enabled: showCfo })

  const activiTotal = activiQ.data?.find((r) => r.locatie_id === null)?.activi ?? 0
  const crestereUltima = crestereQ.data?.[crestereQ.data.length - 1]

  const recurentSlices = useMemo(() => {
    const rows = recurentQ.data ?? []
    const rec = rows.find((r) => r.tip === 'Recurent')?.total ?? 0
    const oneoff = rows.find((r) => r.tip === 'One-off')?.total ?? 0
    const tot = rec + oneoff
    return { rec, oneoff, pct: tot > 0 ? Math.round((100 * rec) / tot) : 0 }
  }, [recurentQ.data])

  return (
    <div>
      <PageHeader
        title="Panou — numere & direcție"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <Link
              to="/"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-quasar-black transition-colors hover:bg-quasar-gray-light"
            >
              ← Operațional zi
            </Link>
            <div className="w-40">
              <Field label="De la luna" htmlFor="an-from">
                <MonthPicker id="an-from" value={fromLuna} onChange={(v) => setFromLuna(v || lunaCuOffset(-11))} />
              </Field>
            </div>
            <div className="w-40">
              <Field label="Până la luna" htmlFor="an-to">
                <MonthPicker id="an-to" value={toLuna} onChange={(v) => setToLuna(v || lunaCurenta())} />
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
            <div className="w-52">
              <Field label="Locație" htmlFor="an-locatie">
                <Select
                  id="an-locatie"
                  placeholder="Toate locațiile"
                  options={locatiiQ.data ?? []}
                  value={locatieId}
                  onChange={(e) => setLocatieId(e.target.value)}
                />
              </Field>
            </div>
          </div>
        }
      />

      {/* ── KPI band ── */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Clienți activi" value={activiQ.isLoading ? '—' : activiTotal} hint="status Activ acum" />
        <KpiCard
          label="Încasări (interval)"
          value={kpisQ.data ? formatRON(kpisQ.data.incasari) : '—'}
          tone="positive"
        />
        <KpiCard
          label="Profit (interval)"
          value={kpisQ.data ? formatRON(kpisQ.data.profit) : '—'}
          tone={kpisQ.data && kpisQ.data.profit < 0 ? 'negative' : 'positive'}
          hint="încasări − cheltuieli"
        />
        <KpiCard
          label="Restanțe net"
          value={restanteQ.data ? formatRON(restanteQ.data.rest_net) : '—'}
          tone="warning"
          hint={restanteQ.data ? `+${formatRON(restanteQ.data.rest_prescris)} prescrise` : undefined}
        />
        <KpiCard
          label="Rată prezență"
          value={prezLunaQ.data ? `${prezLunaQ.data.global.rata}%` : '—'}
          hint="luna curentă"
        />
        <KpiCard
          label="Conversie leads"
          value={conversieQ.data ? `${conversieQ.data.procent}%` : '—'}
          tone="positive"
          hint="ultimele 12 luni"
        />
      </div>

      {/* ── CFO pack (toggle) ── */}
      <div className="mb-8">
        <button
          type="button"
          onClick={() => setShowCfo((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-quasar-black bg-quasar-black px-5 py-3 text-left text-white transition-opacity hover:opacity-90"
        >
          <span className="flex items-center gap-2 font-bold">
            💼 CFO pack
            <span className="font-normal text-gray-300">
              — MRR, rată de încasare/DSO, prag de rentabilitate, LTV:CAC
            </span>
          </span>
          <span className="text-quasar-yellow">{showCfo ? '▲ ascunde' : '▼ arată'}</span>
        </button>

        {showCfo && (
          <div className="mt-4 flex flex-col gap-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            {/* MRR */}
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-quasar-black">
                  MRR — venit recurent lunar
                </h3>
                <span className="text-2xl font-bold text-green-700">
                  {mrrQ.data?.length ? formatRON(Math.round(mrrQ.data[mrrQ.data.length - 1].mrr)) : '—'}
                  <span className="ml-1 text-xs font-normal text-quasar-gray">luna curentă</span>
                </span>
              </div>
              {mrrQ.isLoading ? <Spinner /> : <MrrTrendChart rows={mrrQ.data ?? []} />}
            </div>

            {/* Încasare / DSO + LTV:CAC */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard
                label="Rată de încasare"
                value={colectareQ.data?.rata_colectare != null ? `${colectareQ.data.rata_colectare}%` : '—'}
                tone={colectareQ.data && (colectareQ.data.rata_colectare ?? 0) >= 90 ? 'positive' : 'warning'}
                hint="încasat / facturat în interval"
              />
              <KpiCard
                label="DSO"
                value={colectareQ.data?.dso_zile != null ? `${colectareQ.data.dso_zile} zile` : '—'}
                hint="vechimea medie a creanțelor"
              />
              <KpiCard
                label="Facturat (interval)"
                value={colectareQ.data ? formatRON(colectareQ.data.facturat) : '—'}
              />
              <KpiCard
                label="LTV mediu"
                value={ltvQ.data?.ltv_mediu != null ? formatRON(ltvQ.data.ltv_mediu) : '—'}
                tone="positive"
                hint={ltvQ.data?.durata_medie_luni != null ? `${ltvQ.data.durata_medie_luni} luni medii` : undefined}
              />
              <KpiCard
                label="LTV : CAC"
                value="—"
                hint="adaugă bugetul de marketing pentru CAC"
              />
            </div>

            {/* Prag de rentabilitate */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">
                Prag de rentabilitate per grupă
              </h3>
              {rentabQ.isLoading ? <Spinner /> : <BreakEvenTable rows={rentabQ.data ?? []} />}
            </div>

            <p className="text-xs text-quasar-gray">
              Notă CFO: MRR exclude one-off (bilete/merch/per-ședință). CAC apare
              când bugetul campaniilor de marketing e introdus ca cheltuieli — apoi
              LTV:CAC și payback period se calculează automat.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-10">
        {/* ── 1. Retenție & Churn ── */}
        <section>
          <SectionTitle sub="Fluxurile contează, nu stocul: 300 cursanți nu spun nimic dacă pierzi 30 și înlocuiești 30.">
            1 · Retenție & Churn
          </SectionTitle>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Intrați (luna trecută)" value={crestereUltima?.intrati ?? '—'} tone="positive" />
            <KpiCard label="Pierduți (luna trecută)" value={crestereUltima?.pierduti ?? '—'} tone="negative" />
            <KpiCard
              label="Net"
              value={crestereUltima ? (crestereUltima.net > 0 ? `+${crestereUltima.net}` : crestereUltima.net) : '—'}
              tone={crestereUltima && crestereUltima.net < 0 ? 'negative' : 'positive'}
            />
            <KpiCard
              label="Durată medie înscriere"
              value={ltvQ.data?.durata_medie_luni != null ? `${ltvQ.data.durata_medie_luni} luni` : '—'}
              hint={ltvQ.data?.ltv_mediu != null ? `LTV ~${formatRON(ltvQ.data.ltv_mediu)}` : undefined}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Intrări vs abandonuri (12 luni)</h3>
              {crestereQ.isLoading ? <Spinner /> : <FluxChart rows={crestereQ.data ?? []} />}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Total clienți (12 luni)</h3>
              {crestereQ.isLoading ? <Spinner /> : <TotalClientiChart rows={crestereQ.data ?? []} />}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              {retentieQ.isLoading ? (
                <Spinner />
              ) : (
                <OverviewDonut
                  title="Retenție membri (lună-vs-lună)"
                  percent={retentieQ.data?.rata ?? 0}
                  centerSub="reținuți"
                  slices={[
                    { name: 'Reținuți', value: retentieQ.data?.retinuti ?? 0 },
                    { name: 'Pierduți', value: retentieQ.data?.pierduti ?? 0 },
                  ]}
                  colors={['#16a34a', '#ef4444']}
                />
              )}
            </div>
            <div className="lg:col-span-2">
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Retenție pe cohorte de start</h3>
              {cohorteQ.isLoading ? <Spinner /> : <RetentieCohorteTable rows={cohorteQ.data ?? []} />}
            </div>
          </div>
        </section>

        {/* ── 2. Achiziție ── */}
        <section>
          <SectionTitle sub="Intrarea în pâlnie, nu doar rezultatul.">2 · Pâlnia de achiziție</SectionTitle>
          {funnelQ.isLoading ? (
            <Spinner />
          ) : (
            <FunnelLeadsChart
              data={
                funnelQ.data ?? {
                  global: { leads: 0, contactati: 0, proba: 0, prezenti: 0, convertiti: 0, retentieEligibili: 0, retentie90z: 0 },
                  perSursa: [],
                }
              }
            />
          )}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-4 lg:grid-cols-2">
              <KpiCard label="Lead-uri (12L)" value={conversieQ.data?.total_leads ?? '—'} />
              <KpiCard label="Convertiți" value={conversieQ.data?.convertiti ?? '—'} tone="positive" />
              <KpiCard label="Rată conversie" value={conversieQ.data ? `${conversieQ.data.procent}%` : '—'} tone="positive" />
              <KpiCard label="Zile medii → conversie" value={conversieQ.data?.zile_medii ?? '—'} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Leads pe lună</h3>
              {leadsLunaQ.isLoading ? <Spinner /> : <LeadsLunaChart rows={leadsLunaQ.data ?? []} />}
            </div>
          </div>
        </section>

        {/* ── 3. Risc timpuriu ── */}
        <section>
          <SectionTitle sub="Intervenție înainte să plece — aici un dashboard în timp real își merită banii.">
            3 · Semnale de risc timpuriu
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Cursanți cu absențe consecutive</h3>
              {absenteQ.isLoading ? <Spinner /> : <AbsenteConsecutiveTable rows={absenteQ.data ?? []} />}
            </div>
            <div>
              {agingQ.isLoading ? <Spinner /> : <RestanteAgingChart rows={agingQ.data ?? []} />}
            </div>
          </div>
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-quasar-black">Trend prezență per grupă (grupe în scădere)</h3>
            {trendQ.isLoading ? <Spinner /> : <TrendPrezenteSection rows={trendQ.data ?? []} />}
          </div>
        </section>

        {/* ── 4. Economia grupelor ── */}
        <section>
          <SectionTitle sub="Dincolo de ocuparea brută: prag de rentabilitate și vârf de oră.">
            4 · Economia grupelor
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Grad de ocupare</h3>
              {ocupareQ.isLoading ? <Spinner /> : <OcupareList rows={ocupareQ.data ?? []} />}
            </div>
            <div>
              {primeTimeQ.isLoading ? <Spinner /> : <OcuparePrimeTimeChart rows={primeTimeQ.data ?? []} />}
            </div>
          </div>
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-quasar-black">Rentabilitate per grupă</h3>
            {rentabQ.isLoading ? <Spinner /> : <RentabilitateGrupaTable rows={rentabQ.data ?? []} />}
          </div>
        </section>

        {/* ── 5. Calitatea veniturilor ── */}
        <section>
          <SectionTitle sub="ARPU, mix recurent vs one-off, distribuție pe metode/categorii.">
            5 · Calitatea veniturilor
          </SectionTitle>
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-quasar-black">ARPU pe lună (venit / client activ)</h3>
            {arpuQ.isLoading ? <Spinner /> : <ArpuTrendChart rows={arpuQ.data ?? []} />}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {recurentQ.isLoading ? (
              <Spinner />
            ) : (
              <OverviewDonut
                title="Recurent vs one-off"
                percent={recurentSlices.pct}
                centerSub="recurent"
                slices={[
                  { name: 'Recurent', value: recurentSlices.rec },
                  { name: 'One-off', value: recurentSlices.oneoff },
                ]}
                colors={['#10b981', '#f59e0b']}
              />
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Mix metode de plată</h3>
              {metodeQ.isLoading ? <Spinner /> : <MetodePlataChart rows={metodeQ.data ?? []} />}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-quasar-black">Încasări pe categorie</h3>
              {categIncQ.isLoading ? (
                <Spinner />
              ) : (
                <CategorieChart title="Distribuție încasări" rows={categIncQ.data ?? []} palette={CATEG_INCASARI_PALETTE} />
              )}
            </div>
          </div>
        </section>

        {/* ── 6. Oameni ── */}
        <section>
          <SectionTitle sub="Cel mai subevaluat KPI dintr-o școală de dans: care instructori țin copiii.">
            6 · Oameni — instructori
          </SectionTitle>
          <h3 className="mb-2 text-sm font-semibold text-quasar-black">Clienți per instructor + câștigă/pierde</h3>
          {instructoriQ.isLoading ? <Spinner /> : <InstructoriTrendCard rows={instructoriQ.data ?? []} />}
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-quasar-black">Profitabilitate instructori (12 luni)</h3>
            {profitQ.isLoading ? <Spinner /> : <TeacherMarjaTable rows={profitQ.data ?? []} />}
          </div>
        </section>

        {/* ── 7. Școală de dans ── */}
        <section>
          <SectionTitle sub="Comparații an-la-an (școală sezonieră), multi-stil și frați.">
            7 · Specific școală de dans
          </SectionTitle>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-quasar-black">An-la-an pe aceeași lună</h3>
            <div className="w-44">
              <Select
                value={yoyMetrica}
                onChange={(e) => setYoyMetrica(e.target.value as 'venit' | 'activi')}
                options={[
                  { value: 'venit', label: 'Venit (RON)' },
                  { value: 'activi', label: 'Clienți activi' },
                ]}
              />
            </div>
          </div>
          {yoyQ.isLoading ? <Spinner /> : <YoYChart rows={yoyQ.data ?? []} metrica={yoyMetrica} anCurent={anCurent} />}

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {multiStilQ.isLoading ? (
              <Spinner />
            ) : (
              <OverviewDonut
                title="Cursanți în 2+ stiluri"
                percent={multiStilQ.data?.procent ?? 0}
                centerSub="din activi"
                slices={[
                  { name: '2+ stiluri', value: multiStilQ.data?.multi_stil ?? 0 },
                  { name: 'Un singur stil', value: (multiStilQ.data?.total_activi ?? 0) - (multiStilQ.data?.multi_stil ?? 0) },
                ]}
                colors={['#7c3aed', '#e5e5e5']}
              />
            )}
            <div className="grid grid-cols-1 gap-3 self-start">
              <KpiCard
                label="Familii cu frați înscriși"
                value={fratiQ.data?.familii_cu_frati ?? '—'}
                tone="positive"
                hint={fratiQ.data ? `din ${fratiQ.data.total_familii} familii active` : undefined}
              />
              <KpiCard
                label="Copii în familii cu frați"
                value={fratiQ.data?.copii_in_familii_frati ?? '—'}
                hint="cel mai mic churn"
              />
            </div>
            <div className="self-start">
              <KpiCard
                label="Cursanți multi-stil"
                value={multiStilQ.data?.multi_stil ?? '—'}
                hint={multiStilQ.data ? `din ${multiStilQ.data.total_activi} activi · cel mai mare LTV` : undefined}
              />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-quasar-black">Încasări pe sezon</h3>
            {incasariSezonQ.isLoading ? <Spinner /> : <IncasariSezonChart rows={incasariSezonQ.data ?? []} />}
          </div>
        </section>
      </div>
    </div>
  )
}
