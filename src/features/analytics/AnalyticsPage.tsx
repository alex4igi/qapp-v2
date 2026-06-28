import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Field, MonthPicker, Select, Button } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import {
  getKpis,
  getRataPrezentaLuna,
  getSezonActiv,
  lunaCurenta,
  lunaCuOffset,
  type Interval,
} from '@/features/statistici/api'
import { getConversieLeads, getClientiActivi } from '@/features/ansamblu/api'
import { KpiCard } from '@/features/statistici/KpiCard'
import { getRestanteTotale } from './api'
import { ANALYTICS_QO, LazySection } from './sections/shared'
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

  // ── KPI band (above the fold — pornește imediat) ────────────────────────────
  const kpisQ = useQuery({ queryKey: ['an', 'kpis', interval], queryFn: () => getKpis(interval), ...ANALYTICS_QO })
  const activiQ = useQuery({ queryKey: ['an', 'activi'], queryFn: getClientiActivi, ...ANALYTICS_QO })
  const restanteQ = useQuery({ queryKey: ['an', 'restante', scope], queryFn: () => getRestanteTotale(scope), ...ANALYTICS_QO })
  const prezLunaQ = useQuery({ queryKey: ['an', 'rata-prezenta'], queryFn: getRataPrezentaLuna, ...ANALYTICS_QO })
  const conversieQ = useQuery({ queryKey: ['an', 'conversie'], queryFn: () => getConversieLeads(12), ...ANALYTICS_QO })

  const activiTotal = activiQ.data?.find((r) => r.locatie_id === null)?.activi ?? 0

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
        <KpiCard label="Încasări (interval)" value={kpisQ.data ? formatRON(kpisQ.data.incasari) : '—'} tone="positive" />
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
        <KpiCard label="Rată prezență" value={prezLunaQ.data ? `${prezLunaQ.data.global.rata}%` : '—'} hint="luna curentă" />
        <KpiCard
          label="Conversie leads"
          value={conversieQ.data ? `${conversieQ.data.procent}%` : '—'}
          tone="positive"
          hint="ultimele 12 luni"
        />
      </div>

      <div className="flex flex-col gap-10">
        {/* Secțiunea 1 — above the fold, eager */}
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
          <Section3Risc scope={scope} />
        </LazySection>
        <LazySection>
          <Section4Economie scope={scope} />
        </LazySection>
        <LazySection>
          <Section5Venituri interval={interval} scope={scope} />
        </LazySection>
        <LazySection>
          <Section6Oameni />
        </LazySection>
        <LazySection>
          <Section7Scoala scope={scope} yoyMetrica={yoyMetrica} setYoyMetrica={setYoyMetrica} anCurent={anCurent} />
        </LazySection>
      </div>
    </div>
  )
}
