import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, Field, MonthPicker, Select, Spinner, Button } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { locatiiOptions } from '@/lib/lookups'
import { KpiCard } from '@/features/statistici/KpiCard'
import { getSezonActiv, lunaCurenta, lunaCuOffset, type Interval } from '@/features/statistici/api'
import { getMrrTrend, getColectareDso, getDurataMedieLtv } from './api'
import { MrrTrendChart } from './MrrTrendChart'

// Pagină dedicată CFO — izolată de operațional/strategic (/analytics) ca să nu
// aglomereze qapp. Doar owner+admin (rută ADMIN_OR_OWNER + RPC is_admin()).
export function CfoPage() {
  const [fromLuna, setFromLuna] = useState(lunaCuOffset(-11))
  const [toLuna, setToLuna] = useState(lunaCurenta())
  const [locatieId, setLocatieId] = useState('')

  const interval: Interval = useMemo(() => {
    const f = fromLuna || lunaCuOffset(-11)
    const t = toLuna || lunaCurenta()
    return f > t ? { fromLuna: t, toLuna: f } : { fromLuna: f, toLuna: t }
  }, [fromLuna, toLuna])

  const scope = locatieId || null
  const locatiiQ = useQuery({ queryKey: ['lookup', 'locatii'], queryFn: locatiiOptions })

  const mrrQ = useQuery({ queryKey: ['cfo', 'mrr', interval, scope], queryFn: () => getMrrTrend(interval, scope) })
  const colectareQ = useQuery({ queryKey: ['cfo', 'colectare', interval, scope], queryFn: () => getColectareDso(interval, scope) })
  const ltvQ = useQuery({ queryKey: ['cfo', 'ltv', scope], queryFn: () => getDurataMedieLtv(scope) })

  const mrrCurent = mrrQ.data?.length ? mrrQ.data[mrrQ.data.length - 1].mrr_recurent : null

  return (
    <div>
      <PageHeader
        title="CFO — finanțe"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <Link
              to="/analytics"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-quasar-black transition-colors hover:bg-quasar-gray-light"
            >
              ← Panou numere
            </Link>
            <div className="w-40">
              <Field label="De la luna" htmlFor="cfo-from">
                <MonthPicker id="cfo-from" value={fromLuna} onChange={(v) => setFromLuna(v || lunaCuOffset(-11))} />
              </Field>
            </div>
            <div className="w-40">
              <Field label="Până la luna" htmlFor="cfo-to">
                <MonthPicker id="cfo-to" value={toLuna} onChange={(v) => setToLuna(v || lunaCurenta())} />
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
              <Field label="Locație" htmlFor="cfo-locatie">
                <Select
                  id="cfo-locatie"
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

      <div className="flex flex-col gap-8">
        {/* MRR */}
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold text-quasar-black">
              MRR — venit recurent lunar
              <span className="ml-2 text-sm font-normal text-quasar-gray">
                (banii predictibili din abonamentele active)
              </span>
            </h2>
            <span className="text-2xl font-bold text-green-700">
              {mrrCurent != null ? formatRON(Math.round(mrrCurent)) : '—'}
              <span className="ml-1 text-xs font-normal text-quasar-gray">ultima lună din interval</span>
            </span>
          </div>
          {mrrQ.isLoading ? <Spinner /> : <MrrTrendChart rows={mrrQ.data ?? []} />}
        </section>

        {/* Încasare / DSO + LTV */}
        <section>
          <h2 className="mb-3 text-base font-bold text-quasar-black">Sănătatea încasărilor</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              label="Rată de încasare"
              value={colectareQ.data?.rata_colectare != null ? `${colectareQ.data.rata_colectare}%` : '—'}
              tone={colectareQ.data && (colectareQ.data.rata_colectare ?? 0) >= 90 ? 'positive' : 'warning'}
              hint="cât din ce ai facturat a și intrat"
            />
            <KpiCard
              label="DSO"
              value={colectareQ.data?.dso_zile != null ? `${colectareQ.data.dso_zile} zile` : '—'}
              hint="câte zile durează să încasezi"
            />
            <KpiCard
              label="Facturat (interval)"
              value={colectareQ.data ? formatRON(colectareQ.data.facturat) : '—'}
              hint="cât ai emis de încasat"
            />
            <KpiCard
              label="LTV total"
              value={ltvQ.data?.ltv_total != null ? formatRON(ltvQ.data.ltv_total) : '—'}
              tone="positive"
              hint={
                ltvQ.data?.durata_medie_luni != null
                  ? `tot ce aduce un client, pe tot istoricul (~${ltvQ.data.durata_medie_luni} luni)`
                  : 'tot ce aduce un client, pe tot istoricul'
              }
            />
            <KpiCard
              label="LTV recurent"
              value={ltvQ.data?.ltv_recurent != null ? formatRON(ltvQ.data.ltv_recurent) : '—'}
              hint="doar din abonamente (coerent cu durata)"
            />
            <KpiCard label="LTV : CAC" value="—" hint="costul de achiziție vine cu modulul de marketing" />
          </div>
        </section>

        <p className="text-xs text-quasar-gray">
          Notă: MRR exclude one-off (bilete/merch/per-ședință). CAC + payback period
          se activează când introducem bugetul de marketing — momentan parcate, ca
          să nu aglomerăm. Pragul de rentabilitate pe grupă revine când în sistem
          există costuri: azi salariile și cheltuielile lipsesc, iar marja ar ieși
          egală cu încasările.
        </p>
      </div>
    </div>
  )
}
