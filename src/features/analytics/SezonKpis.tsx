import { formatRON } from '@/lib/format'
import { procentOcupare } from '@/features/ansamblu/api'
import type { Prag } from '@/features/scorecard/api'
import { praguriRata, semaforRataRestante } from '@/features/datorii/semafor'
import type { GrupeSubMinimSumar } from '@/features/ansamblu/useDeUrmarit'
import type { IndicatoriSezon } from './api'
import { DeltaKpiCard } from './DeltaKpiCard'
import { dataScurta, deltaProcent, motivText, notaLocuriFaraPrezenta } from './comparatii'

const INFO_CURSANTI = (
  <>
    <p className="font-semibold">Ce numără</p>
    <p className="mt-1">
      Oamenii cu cel puțin un loc cu taxă azi: înrolare cu valoare, nereziliată. O
      ședință plătită ține locul 30 de zile. Un copil la două grupe e un singur
      cursant.
    </p>
    <p className="mt-1.5">
      <strong>„Plătitor" înseamnă „are loc cu taxă", nu „a plătit".</strong> În cifră
      intră și cei cu rate scadente neachitate — vezi rândul de sub ea.
    </p>
    <p className="mt-1.5">
      Aceeași regulă ca ocuparea, pragul minim al grupei și grilele de salarizare.
    </p>
  </>
)

const INFO_INCASARI = (
  <>
    <p className="font-semibold">Cum se calculează</p>
    <p className="mt-1">
      Suma încasărilor pe data plății, atribuite locației la care s-au încasat — ca
      în registrul /plati.
    </p>
    <p className="mt-1.5">
      Se cumulează de la prima lună comparabilă cu sezonul trecut și se compară cu
      aceeași fereastră de acum un an. Septembrie 2025 nu intră: a fost o lună
      parțială în date.
    </p>
  </>
)

const INFO_RESTANTE = (
  <>
    <p className="font-semibold">Ce numără</p>
    <p className="mt-1">
      Restul de plată doar pe ratele trecute de scadență, fără cele prescrise —
      exact tabul „Restanțe pe rate" din /datorii.
    </p>
    <p className="mt-1.5">
      Ratele lunii care n-au ajuns la scadență nu intră, deci cifra nu sare pe 1
      ale lunii.
    </p>
  </>
)

const INFO_OCUPARE = (
  <>
    <p className="font-semibold">Cum se calculează</p>
    <p className="mt-1">
      Locuri ocupate azi împărțit la capacitatea maximă a grupelor din sezon —
      aceeași cifră ca pe /overview.
    </p>
    <p className="mt-1.5">
      Comparația folosește grupele și locurile de la aceeași dată de anul trecut.
    </p>
  </>
)

type Props = {
  d: IndicatoriSezon
  grupe: GrupeSubMinimSumar | null
  praguri: Prag[] | undefined
}

export function SezonKpis({ d, grupe, praguri }: Props) {
  const vsRef = `vs ${dataScurta(d.referinta)}`

  const c = d.cursanti
  const cuRate = c.cu_rate_scadente
  const cursantiMotiv = motivText(c.motiv, {
    referinta: d.referinta,
    praguri: d.praguri,
    acoperire: c.acoperire,
    acoperireRef: c.acoperire_ref,
  })

  const inc = d.incasari
  const incDelta = inc.comparabil ? deltaProcent(inc.valoare, inc.referinta) : null
  const incMotiv = motivText(inc.motiv, {
    referinta: d.referinta,
    praguri: d.praguri,
    primaLuna: inc.prima_luna_comparabila,
    plataInLuna: inc.plata_in_luna,
    plataInLunaRef: inc.plata_in_luna_ref,
  })
  const pondereAb = inc.valoare > 0 ? Math.round((100 * inc.abonamente) / inc.valoare) : null

  const o = d.ocupare
  const ocupareAzi = procentOcupare(o.ocupate, o.capacitate)
  const ocupareRef = procentOcupare(o.ocupate_ref, o.capacitate_ref)
  const ocupareMotiv = motivText(o.motiv, {
    referinta: d.referinta,
    praguri: d.praguri,
    acoperire: c.acoperire,
    acoperireRef: c.acoperire_ref,
  })

  const r = d.restante
  const rataLuna = r && r.de_incasat_luna > 0 ? Math.round((1000 * r.rest_luna) / r.de_incasat_luna) / 10 : null
  const semafor = semaforRataRestante(rataLuna, praguri)
  const { standard } = praguriRata(praguri)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <DeltaKpiCard
        label="Cursanți plătitori"
        value={c.valoare.toLocaleString('ro-RO')}
        sub={
          cuRate != null
            ? `${(c.valoare - cuRate).toLocaleString('ro-RO')} cu plata la zi · ${cuRate.toLocaleString('ro-RO')} cu rate scadente`
            : undefined
        }
        comparatie={c.comparabil ? { delta: c.valoare - c.referinta, eticheta: vsRef } : null}
        motiv={cursantiMotiv}
        nota={notaLocuriFaraPrezenta(c)}
        info={INFO_CURSANTI}
      />
      <DeltaKpiCard
        label="Încasări"
        value={formatRON(inc.valoare)}
        sub={`de la ${dataScurta(inc.de_la)} până azi${pondereAb != null ? ` · ${pondereAb}% abonamente` : ''}`}
        comparatie={
          incDelta != null && inc.ref_de_la
            ? { delta: incDelta, suffix: '%', eticheta: `vs ${dataScurta(inc.ref_de_la)} – ${dataScurta(d.referinta)}` }
            : null
        }
        motiv={incMotiv}
        info={INFO_INCASARI}
        to="/plati"
      />
      <DeltaKpiCard
        label="Restanțe scadente"
        value={r ? formatRON(r.suma) : '—'}
        sub={
          r ? (
            <>
              {r.clienti.toLocaleString('ro-RO')} datornici · {r.rate.toLocaleString('ro-RO')} rate
              {r.oneoff > 0 ? ` · + ${formatRON(r.oneoff)} one-off` : ''}
              {rataLuna != null && (
                <span
                  className={`ml-1 font-medium ${semafor === 'rosu' ? 'text-danger' : semafor === 'galben' ? 'text-warn' : 'text-success'}`}
                >
                  · luna asta {rataLuna.toLocaleString('ro-RO')}% (prag {standard}%)
                </span>
              )}
            </>
          ) : undefined
        }
        info={INFO_RESTANTE}
        to="/datorii"
      />
      <DeltaKpiCard
        label="Ocupare"
        value={`${ocupareAzi.toLocaleString('ro-RO')}%`}
        sub={
          <>
            {o.ocupate.toLocaleString('ro-RO')} din {o.capacitate.toLocaleString('ro-RO')} locuri
            {grupe && grupe.lunaAsta + grupe.inObservatie + grupe.deSuspendat > 0
              ? ` · ${grupe.total} grupe sub minim`
              : ''}
          </>
        }
        comparatie={
          o.comparabil
            ? { delta: Math.round((ocupareAzi - ocupareRef) * 10) / 10, suffix: ' pp', eticheta: vsRef }
            : null
        }
        motiv={ocupareMotiv}
        nota={notaLocuriFaraPrezenta(c)}
        info={INFO_OCUPARE}
        to="/cursuri"
      />
    </div>
  )
}
