import { Badge, type BadgeTone } from '@/components/ui'
import { formatRON } from '@/lib/format'
import {
  BANDA_ETICHETA,
  NIVEL_PLATA_ETICHETA,
  type BandaSalariu,
  type SalariuTeacherCalc,
} from '@/lib/salariuTeacher'

const TON: Record<BandaSalariu, BadgeTone> = {
  peste: 'success',
  standard: 'brand',
  prima_luna: 'brand',
  sub: 'danger',
}

function Treapta({ banda, suma, detaliu }: { banda: BandaSalariu; suma: number; detaliu: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Badge tone={TON[banda]}>{BANDA_ETICHETA[banda]}</Badge>
        <span className="font-medium text-ink">{formatRON(suma)}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">{detaliu}</div>
    </div>
  )
}

/** Salariul unei luni pe grila 2026-2027: pe grupe, apoi liniile pe om. */
export function SalariuTeacherDetaliu({ calc }: { calc: SalariuTeacherCalc }) {
  const vara = calc.perioada === 'vara'

  return (
    <div className="space-y-4">
      {calc.blocante.length > 0 && (
        <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          <div className="mb-1 font-semibold">Luna nu se poate confirma până nu se completează:</div>
          <ul className="list-inside list-disc">
            {calc.blocante.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {calc.grupe.length === 0 && !vara ? (
        <p className="text-sm text-muted">Nicio grupă în luna asta.</p>
      ) : calc.grupe.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 pr-3">Grupă</th>
                <th className="pb-2 pr-3">Cursanți</th>
                <th className="pb-2 pr-3 text-right">Bază</th>
                {!vara && <th className="pb-2 pr-3">Retenție</th>}
                {!vara && <th className="pb-2 pr-3">Ocupare</th>}
                {vara && <th className="pb-2 pr-3">Test de maturitate</th>}
                <th className="pb-2 text-right">Total grupă</th>
              </tr>
            </thead>
            <tbody>
              {calc.grupe.map((g) => (
                <tr key={g.curs_id} className="border-t border-line align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-ink">{g.curs_nume}</div>
                    <div className="text-xs text-muted">
                      {g.nivel_plata ? NIVEL_PLATA_ETICHETA[g.nivel_plata] : 'fără nivel'} ·{' '}
                      {g.sedinte_per_sapt} ședinț{g.sedinte_per_sapt === 1 ? 'ă' : 'e'}/săpt
                      {g.factor < 1 && ' · jumătate'}
                    </div>
                    {g.blocant && <div className="mt-1 text-xs text-danger">{g.blocant}</div>}
                  </td>
                  <td className="py-2 pr-3 text-ink">
                    {g.cursanti}
                    {g.capacitate ? <span className="text-muted"> / {g.capacitate}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right text-ink">{formatRON(g.baza)}</td>
                  {!vara && (
                    <td className="py-2 pr-3">
                      {g.retentie && (
                        <Treapta
                          banda={g.retentie.banda}
                          suma={g.retentie.suma}
                          detaliu={
                            g.retentie.banda === 'prima_luna'
                              ? 'fără lună anterioară'
                              : `${g.retentie.pastrati} din ${g.retentie.n_luna_trecuta} au rămas · ${g.retentie.procent}%`
                          }
                        />
                      )}
                    </td>
                  )}
                  {!vara && (
                    <td className="py-2 pr-3">
                      {g.ocupare ? (
                        <Treapta
                          banda={g.ocupare.banda}
                          suma={g.ocupare.suma}
                          detaliu={
                            g.ocupare.mod === 'standard_fix'
                              ? `septembrie: standard la toți · măsurat ${g.ocupare.cursanti}/${g.ocupare.capacitate}`
                              : `standard de la ${g.ocupare.prag_standard} · peste de la ${g.ocupare.prag_peste}`
                          }
                        />
                      ) : (
                        <span className="text-xs text-muted">
                          {g.nivel_plata === 'trupa' ? 'trupă: fără ocupare' : '—'}
                        </span>
                      )}
                    </td>
                  )}
                  {vara && (
                    <td className="py-2 pr-3 text-xs text-muted">
                      {g.maturitate
                        ? `${g.maturitate.serie_max} luni la rând cu ≥${g.maturitate.minim} (trebuie ${g.maturitate.necesar})`
                        : '—'}
                    </td>
                  )}
                  <td className="py-2 text-right font-semibold text-ink">{formatRON(g.suma)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Nicio grupă n-a trecut testul de maturitate: vara nu se plătește baza.</p>
      )}

      {vara && calc.prezente_vara.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Prezențe de vară · {calc.total_prezente} × 6 lei
          </h4>
          <ul className="space-y-0.5 text-sm">
            {calc.prezente_vara.map((p) => (
              <li key={p.curs_id} className="flex justify-between gap-3">
                <span className="text-ink">{p.curs_nume}</span>
                <span className="text-muted">
                  {p.nr} prezențe · <span className="font-medium text-ink">{formatRON(p.suma)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-sm">
        {calc.linii_persoana.map((l) => (
          <span key={l.cheie} className="text-muted">
            {l.eticheta}: <span className="font-medium text-ink">{formatRON(l.suma)}</span>
            {l.tip === 'beneficiu' && ' (beneficiu, nu intră în total)'}
            {l.nota && ` · ${l.nota}`}
          </span>
        ))}
        {calc.totaluri.info_deplasari > 0 && (
          <span className="text-muted">
            Buget deplasări: {formatRON(calc.totaluri.info_deplasari)} pe sezon (informativ)
          </span>
        )}
      </div>
    </div>
  )
}
