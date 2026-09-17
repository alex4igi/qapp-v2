import { useState } from 'react'
import { Badge, type BadgeTone } from '@/components/ui'
import { formatRON } from '@/lib/format'
import { ETICHETA_BANDA, type Banda, type LinieRaport } from './types'

const TON: Record<Banda, BadgeTone> = {
  peste: 'success',
  standard: 'brand',
  sub: 'danger',
  na: 'neutral',
}

function formatValoare(l: LinieRaport): string {
  if (l.tip_prag === 'afirmativ') return l.bifa == null ? '—' : l.bifa ? 'DA' : 'NU'
  if (l.valoare == null) return '—'
  return `${l.valoare}${l.unitate ?? ''}`
}

function formatPrag(l: LinieRaport): string {
  if (l.tip_prag === 'afirmativ') return 'DA / NU'
  const u = l.unitate ?? ''
  const std = l.prag_standard == null ? '—' : `${l.prag_standard}${u}`
  const peste = l.prag_peste == null ? null : `${l.prag_peste}${u}`
  return peste ? `standard ${std} · peste ${peste}` : `standard ${std}`
}

/** Perechile pe care le arătăm la desfășurare, pe indicator. */
function drillDown(l: LinieRaport): [string, string][] {
  const d = (l.detalii ?? {}) as Record<string, unknown>
  const n = (k: string) => (d[k] == null ? null : String(d[k]))
  const lei = (k: string) => (d[k] == null ? null : formatRON(Number(d[k])))
  const out: [string, string | null][] = []

  if (l.cheie === 'incasare_la_termen') {
    out.push(['Scadent în lună', lei('numitor')])
    out.push([`Încasat până în ziua ${n('zi_termen') ?? '20'}`, lei('numarator')])
    out.push(['Rata finală a lunii (informativ)', n('rata_finala') ? `${n('rata_finala')}%` : null])
    out.push(['Înrolări în bază', n('nr_inrolari')])
  } else if (l.cheie === 'restante_recuperate') {
    const benzi = (d.benzi ?? {}) as Record<string, unknown>
    out.push(['Stoc în bază (30 zile – 1 an)', lei('numitor')])
    out.push(['Recuperat în lună', lei('numarator')])
    out.push(['Datornici în bază', n('nr_datornici')])
    out.push(['din care banda 30–90 zile', benzi.recuperat_30_90 == null ? null : formatRON(Number(benzi.recuperat_30_90))])
    out.push(['din care banda 90 zile – 1 an', benzi.recuperat_90_max == null ? null : formatRON(Number(benzi.recuperat_90_max))])
    out.push(['Stoc exclus (peste 1 an)', lei('stoc_peste_max')])
  } else if (l.cheie === 'reactivare_21z') {
    out.push(['Cazuri intrate în jurnal', n('numitor')])
    out.push(['Reveniți la curs', n('numarator')])
    out.push([`Contactate în ${n('poarta_ore') ?? '48'}h`, n('contactate_la_timp')])
    out.push(['Contactate târziu', n('contactate_tarziu')])
    out.push(['Necontactate', n('necontactate')])
    out.push(['Cu fereastra încă deschisă', n('neevaluate')])
  } else if (l.cheie === 'conversie_lead') {
    out.push(['Cohorta lunii', n('luna_cohortei')])
    out.push(['Leaduri în cohortă', n('numitor')])
    out.push([`Au plătit în ${n('fereastra_zile') ?? '30'} de zile`, n('numarator')])
    out.push(['Excluși: erau deja clienți', n('deja_clienti')])
    // Cifra asta separă „a lucrat slab" de „leadurile n-au fost atribuite".
    out.push(['Leaduri fără punct de lucru (pe club)', n('fara_locatie')])
  } else if (l.cheie === 'raspuns_24h') {
    out.push(['Timp mediu de răspuns', n('timp_mediu') ? `${n('timp_mediu')} ore` : null])
    out.push(['Apeluri pierdute fără revenire', n('apeluri_pierdute')])
    out.push(['Primul răspuns a fost real', d.sondaj_real == null ? null : d.sondaj_real ? 'DA' : 'NU'])
  }

  return out.filter((x): x is [string, string] => x[1] != null)
}

export function KpiSectiune({ linie }: { linie: LinieRaport }) {
  const [deschis, setDeschis] = useState(false)
  const detalii = drillDown(linie)

  return (
    <div
      className={`rounded-xl border p-4 ${
        linie.aplicabil ? 'border-line bg-card' : 'border-dashed border-line bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{linie.denumire}</span>
            <Badge tone="neutral">{linie.pondere}%</Badge>
            {!linie.aplicabil && <Badge tone="neutral">nu se aplică luna asta</Badge>}
            {linie.sursa === 'manual' && <Badge tone="neutral">manual</Badge>}
          </div>
          <div className="mt-1 text-xs text-muted">{formatPrag(linie)}</div>
        </div>

        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-lg font-bold text-ink">{formatValoare(linie)}</div>
            <Badge tone={TON[linie.banda]}>{ETICHETA_BANDA[linie.banda]}</Badge>
          </div>
          <div className="w-24">
            <div className="text-lg font-bold text-ink">{formatRON(linie.suma)}</div>
            {linie.mod_calcul === 'comision' && linie.comision_procent != null && (
              <div className="text-xs text-muted">
                {linie.comision_procent}% · plafon {formatRON(linie.comision_plafon ?? 0)}
              </div>
            )}
          </div>
        </div>
      </div>

      {linie.are_poarta && linie.poarta_ok === false && (
        <div className="mt-3 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          Poarta de proces nu e trecută: nu toate cazurile au fost contactate în termen. Linia se
          plătește cu zero indiferent de rată.
        </div>
      )}

      {linie.banda === 'na' && (
        <div className="mt-3 rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">
          {linie.motiv === 'numitor_zero'
            ? 'N-a existat ce măsura luna asta — ponderea se redistribuie peste ceilalți indicatori.'
            : (linie.motiv_text ?? 'Datele manuale nu sunt completate.')}
        </div>
      )}

      {linie.conditie && (
        <p className="mt-3 border-l-2 border-quasar-yellow pl-3 text-sm text-muted">
          {linie.conditie}
        </p>
      )}

      {detalii.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setDeschis((v) => !v)}
            className="mt-3 text-xs font-medium text-muted underline underline-offset-2"
          >
            {deschis ? 'Ascunde calculul' : 'Vezi calculul'}
          </button>
          {deschis && (
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {detalii.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line py-1">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  )
}
