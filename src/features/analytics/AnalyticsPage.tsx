import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Field, MonthPicker, Select, Button, LazySection } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import {
  getKpis,
  getSezonActiv,
  lunaCurenta,
  lunaCuOffset,
  type Interval,
} from '@/features/statistici/api'
import { getConversieLeads } from '@/features/ansamblu/api'
import { KpiCard } from '@/features/statistici/KpiCard'
import { ANALYTICS_QO } from './sections/shared'
import { Section0PachetLuni } from './sections/Section0PachetLuni'
import { Section1Retentie } from './sections/Section1Retentie'
import { Section2Achizitie } from './sections/Section2Achizitie'
import { Section3Risc } from './sections/Section3Risc'
import { Section4Economie } from './sections/Section4Economie'
import { Section5Venituri } from './sections/Section5Venituri'
import { Section6Oameni } from './sections/Section6Oameni'
import { Section7Scoala } from './sections/Section7Scoala'

export function AnalyticsPage() {
  const [fromLuna, setFromLuna] = useState(lunaCuOffset(-11))
  const [toLuna, setToLuna] = useState(lunaCurenta())
  const [locatieId, setLocatieId] = useState('')
  const [yoyMetrica, setYoyMetrica] = useState<'venit' | 'activi'>('venit')

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

  // ── Above the fold: pachetul de luni + KPI financiare pe interval ───────────
  // Încasări respectă locația; Profit rămâne global (cheltuielile nu au dimensiune
  // de locație → un profit „pe locație" ar fi înșelător). Când scope=null, cele
  // două query-uri au aceeași cheie și React Query le deduplică.
  const kpisQ = useQuery({ queryKey: ['an', 'kpis', interval, scope], queryFn: () => getKpis(interval, scope), ...ANALYTICS_QO })
  const kpisGlobalQ = useQuery({ queryKey: ['an', 'kpis', interval, null], queryFn: () => getKpis(interval, null), ...ANALYTICS_QO })
  const conversieQ = useQuery({ queryKey: ['an', 'conversie', locatieLabel], queryFn: () => getConversieLeads(12, locatieLabel), ...ANALYTICS_QO })

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

      <div className="flex flex-col gap-10">
        {/* Secțiunea 0 — pachetul de luni (eager) */}
        <Section0PachetLuni scope={scope} />

        {/* KPI financiare pe intervalul din header */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Încasări (interval)" value={kpisQ.data ? formatRON(kpisQ.data.incasari) : '—'} tone="positive" />
          <KpiCard
            label={scope ? 'Profit (interval) · tot clubul' : 'Profit (interval)'}
            value={kpisGlobalQ.data ? formatRON(kpisGlobalQ.data.profit) : '—'}
            tone={kpisGlobalQ.data && kpisGlobalQ.data.profit < 0 ? 'negative' : 'positive'}
            hint={scope ? 'încasări − cheltuieli · cheltuielile nu se împart pe locație' : 'încasări − cheltuieli'}
          />
        </div>

        <Section1Retentie scope={scope} />

        {/* Secțiunile 2–7 — pornesc query-urile abia la scroll */}
        <LazySection>
          <Section2Achizitie
            interval={interval}
            scope={scope}
            locatieId={locatieId}
            locatieLabel={locatieLabel}
            conversie={conversieQ.data}
          />
        </LazySection>
        <LazySection>
          <div id="sec-risc">
            <Section3Risc scope={scope} />
          </div>
        </LazySection>
        <LazySection>
          <Section4Economie scope={scope} />
        </LazySection>
        <LazySection>
          <Section5Venituri interval={interval} scope={scope} />
        </LazySection>
        <LazySection>
          <Section6Oameni scoped={!!scope} />
        </LazySection>
        <LazySection>
          <Section7Scoala scope={scope} yoyMetrica={yoyMetrica} setYoyMetrica={setYoyMetrica} anCurent={anCurent} />
        </LazySection>
      </div>
    </div>
  )
}
