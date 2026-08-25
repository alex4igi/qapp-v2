import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { getGradOcupare } from '@/features/ansamblu/api'
import { listPraguri } from '@/features/scorecard/api'
import { getPachetLuni, getPrezentaSaptamanaGrupe } from '../api'
import { DeltaKpiCard } from '../DeltaKpiCard'
import { ANALYTICS_QO, SectionTitle } from './shared'

const PRAG_RENTABILITATE = 7

function delta(curent: number | null, referinta: number | null): number | null {
  if (curent == null || referinta == null) return null
  return Math.round((curent - referinta) * 10) / 10
}

function dataScurta(iso: string): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
}

function GrupTitlu({ children }: { children: string }) {
  return <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-quasar-gray first:mt-0">{children}</div>
}

export function Section0PachetLuni({ scope }: { scope?: string | null }) {
  const pachetQ = useQuery({ queryKey: ['an', 'pachet-luni', scope], queryFn: () => getPachetLuni(scope), ...ANALYTICS_QO })
  const grupeQ = useQuery({ queryKey: ['an', 'prezenta-grupe', scope], queryFn: () => getPrezentaSaptamanaGrupe(scope), ...ANALYTICS_QO })
  const ocupareQ = useQuery({ queryKey: ['an', 'ocupare', scope], queryFn: () => getGradOcupare(scope ?? null), ...ANALYTICS_QO })
  const praguriQ = useQuery({ queryKey: ['scorecard', 'praguri'], queryFn: listPraguri, ...ANALYTICS_QO })
  // Ținta de restanțe vine din configul scorecard_praguri.rata_restante (nu hardcodat).
  const tintaRestante = Number(praguriQ.data?.find((x) => x.cheie === 'rata_restante')?.prag_peste ?? 5)

  const p = pachetQ.data
  // Cifrele pe leads (leads.locatia e text liber, ~93% null) afișează un caveat când se filtrează.
  const leadNote = scope ? ' · doar leads cu locația setată' : ''

  const subPrag = (ocupareQ.data ?? []).filter((r) => !r.facultativ && r.activi < PRAG_RENTABILITATE)
  const lunaChurn = p?.churn.luna
    ? new Date(`${p.churn.luna}-01T00:00:00`).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })
    : null

  return (
    <section>
      <SectionTitle
        sub={
          p
            ? `Săptămâna încheiată ${dataScurta(p.saptamana.start)} – ${dataScurta(p.saptamana.end)} · fiecare cifră vs. săptămâna trecută și vs. anul trecut`
            : 'Cele 10 cifre de luni dimineața'
        }
      >
        0 · Pachetul de luni
      </SectionTitle>

      {pachetQ.isLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !p ? (
        <p className="text-sm text-quasar-gray">Pachetul de luni e disponibil doar pentru owner/admin.</p>
      ) : (
        <>
          <GrupTitlu>A · Puls</GrupTitlu>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <DeltaKpiCard
              label="Elevi activi"
              hero
              value={p.activi.curent ?? '—'}
              deltaPrev={delta(p.activi.curent, p.activi.prev)}
              deltaYoy={delta(p.activi.curent, p.activi.yoy)}
              hint="înrolare valabilă azi sau prezență în ultimele 21 zile"
            />
            <DeltaKpiCard
              label="Creștere netă (săpt.)"
              value={p.crestere_neta.curent != null && p.crestere_neta.curent > 0 ? `+${p.crestere_neta.curent}` : (p.crestere_neta.curent ?? '—')}
              sub={
                p.crestere_neta.intrati != null
                  ? `+${p.crestere_neta.intrati} intrați · −${p.crestere_neta.iesiti ?? 0} ieșiți`
                  : undefined
              }
              deltaPrev={delta(p.crestere_neta.curent, p.crestere_neta.prev)}
              deltaYoy={delta(p.crestere_neta.curent, p.crestere_neta.yoy)}
              hint="diferența de elevi activi între duminici · țintă +2-3/săpt"
            />
            <DeltaKpiCard
              label="Churn lunar"
              value={p.churn.rata != null ? `${p.churn.rata}%` : '—'}
              sub={
                lunaChurn && p.churn.pierduti != null
                  ? `${lunaChurn} · ${p.churn.pierduti} pierduți din ${p.churn.baza}`
                  : undefined
              }
              deltaPrev={delta(p.churn.rata, p.churn.prev)}
              deltaYoy={delta(p.churn.rata, p.churn.yoy)}
              deltaSuffix="pp"
              polaritateInversa
              hint="fără plată la 30 zile după scadență · țintă sub 4%"
            />
          </div>

          <GrupTitlu>B · Achiziție</GrupTitlu>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <DeltaKpiCard
              label="Lead-uri noi (săpt.)"
              value={p.leads_noi.curent ?? '—'}
              deltaPrev={delta(p.leads_noi.curent, p.leads_noi.prev)}
              deltaYoy={delta(p.leads_noi.curent, p.leads_noi.yoy)}
              hint={`țintă 20-25/săpt${leadNote}`}
            />
            <DeltaKpiCard
              label="Înscrieri noi (săpt.)"
              value={p.inscrieri_noi.curent ?? '—'}
              deltaPrev={delta(p.inscrieri_noi.curent, p.inscrieri_noi.prev)}
              deltaYoy={delta(p.inscrieri_noi.curent, p.inscrieri_noi.yoy)}
              hint="prima plată de abonament — bani intrați · țintă 6-7/săpt"
            />
            <DeltaKpiCard
              label="Conversie lead→înscris"
              value={p.conversie_30z.curent != null ? `${p.conversie_30z.curent}%` : '—'}
              sub={
                p.conversie_30z.convertiti != null
                  ? `${p.conversie_30z.convertiti} din ${p.conversie_30z.leads} leads (30 zile)`
                  : undefined
              }
              deltaPrev={delta(p.conversie_30z.curent, p.conversie_30z.prev)}
              deltaYoy={delta(p.conversie_30z.curent, p.conversie_30z.yoy)}
              deltaSuffix="pp"
              hint={`fereastră rulantă 30 zile · țintă 30-35%${leadNote}`}
            />
          </div>

          <GrupTitlu>C · Prezență & risc</GrupTitlu>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <DeltaKpiCard
                label="Rată prezență (săpt.)"
                value={p.prezenta.curent != null ? `${p.prezenta.curent}%` : '—'}
                sub={
                  p.prezenta.prezenti != null ? `${p.prezenta.prezenti} prezențe din ${p.prezenta.posibile} posibile` : undefined
                }
                deltaPrev={delta(p.prezenta.curent, p.prezenta.prev)}
                deltaYoy={delta(p.prezenta.curent, p.prezenta.yoy)}
                deltaSuffix="pp"
                hint="țintă peste 80% · scade cu 3-6 săpt. înaintea retragerii"
              />
              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs text-quasar-gray hover:text-quasar-black">
                  Detaliu per grupă ({grupeQ.data?.length ?? 0})
                </summary>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line bg-card">
                  {(grupeQ.data ?? []).map((g) => (
                    <div key={g.curs_id} className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs last:border-b-0">
                      <span className="truncate">
                        {g.curs_nume}
                        {g.locatie_nume ? <span className="text-quasar-gray"> · {g.locatie_nume}</span> : null}
                      </span>
                      <span className="fnum ml-2 shrink-0 font-semibold">
                        {g.rata != null ? `${g.rata}%` : '—'}
                        <span className="ml-1 font-normal text-quasar-gray">({g.prezenti}/{g.posibile})</span>
                      </span>
                    </div>
                  ))}
                  {!grupeQ.isLoading && (grupeQ.data ?? []).length === 0 && (
                    <div className="px-3 py-2 text-xs text-quasar-gray">Nicio ședință marcată săptămâna trecută.</div>
                  )}
                </div>
              </details>
            </div>
            <div>
              <DeltaKpiCard
                label="Elevi în risc"
                value={p.risc.elevi ?? '—'}
                polaritateInversa
                hint="au ratat 2+ săptămâni de ședințe, neanunțat · de contactat în 48h"
              />
              <a href="#sec-risc" className="mt-1.5 inline-block text-xs text-quasar-gray underline hover:text-quasar-black">
                Vezi lista în secțiunea 3 ↓
              </a>
            </div>
          </div>

          <GrupTitlu>D · Bani & capacitate</GrupTitlu>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DeltaKpiCard
              label="Restanțe (>7z peste scadență)"
              value={formatRON(p.restante.suma)}
              sub={`${p.restante.familii} familii · ${p.restante.procent_facturare ?? 0}% din facturarea lunii`}
              deltaPrev={delta(p.restante.suma, p.restante.prev)}
              deltaYoy={delta(p.restante.suma, p.restante.yoy)}
              polaritateInversa
              hint={`țintă sub ${tintaRestante}% din facturarea lunii`}
            />
            <div>
              <DeltaKpiCard
                label="Grad de umplere"
                value={p.umplere.media != null ? `${p.umplere.media}%` : '—'}
                sub={
                  p.umplere.sub_prag != null
                    ? `${p.umplere.sub_prag} grupe sub pragul de ${PRAG_RENTABILITATE}`
                    : 'sezonul activ nu are grupe recurente'
                }
                deltaPrev={delta(p.umplere.media, p.umplere.prev)}
                deltaYoy={null}
                deltaSuffix="pp"
                hint="țintă 75%+ la orele de vârf"
              />
              {subPrag.length > 0 && (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-quasar-gray hover:text-quasar-black">
                    Grupe sub prag ({subPrag.length})
                  </summary>
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line bg-card">
                    {subPrag.map((r) => (
                      <div key={r.curs_id} className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs last:border-b-0">
                        <span className="truncate">
                          {r.curs_nume}
                          {r.locatie_nume ? <span className="text-quasar-gray"> · {r.locatie_nume}</span> : null}
                        </span>
                        <span className="fnum ml-2 shrink-0 font-semibold">
                          {r.activi}/{r.capacitate ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
