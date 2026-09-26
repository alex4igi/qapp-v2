import type { ReactNode } from 'react'
import { formatRON } from '@/lib/format'
import { procentOcupare } from '@/features/ansamblu/api'
import type { IndicatoriLocatie } from './api'
import { dataScurta, deltaProcent } from './comparatii'

function Delta({ valoare, suffix = '' }: { valoare: number | null; suffix?: string }) {
  if (valoare == null) return <span className="text-muted">—</span>
  const cls = valoare > 0 ? 'text-success' : valoare < 0 ? 'text-danger' : 'text-muted'
  const semn = valoare > 0 ? '+' : valoare < 0 ? '−' : ''
  return (
    <span className={`fnum font-semibold ${cls}`}>
      {semn}
      {Math.abs(valoare).toLocaleString('ro-RO', { maximumFractionDigits: 1 })}
      {suffix}
    </span>
  )
}

function Celula({ azi, delta }: { azi: ReactNode; delta: ReactNode }) {
  return (
    <td className="px-3 py-2.5 text-right">
      <div className="fnum text-ink">{azi}</div>
      <div className="text-xs">{delta}</div>
    </td>
  )
}

// Aceleași cifre ca pe carduri, pe fiecare locație. O celulă fără comparație
// credibilă arată „—", nu 0.
export function SchimbariLocatii({ rows, referinta }: { rows: IndicatoriLocatie[]; referinta: string }) {
  if (rows.length === 0) return null

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <h3 className="text-sm font-semibold text-ink">Ce s-a schimbat pe locații</h3>
      <p className="mb-3 text-xs text-muted-2">Față de {dataScurta(referinta)}. „—" = fără comparație credibilă.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-semibold">Locație</th>
              <th className="px-3 py-2 text-right font-semibold">Cursanți plătitori</th>
              <th className="px-3 py-2 text-right font-semibold">Ocupare</th>
              <th className="px-3 py-2 text-right font-semibold">Încasări</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const oAzi = procentOcupare(r.ocupare.ocupate, r.ocupare.capacitate)
              const oRef = procentOcupare(r.ocupare.ocupate_ref, r.ocupare.capacitate_ref)
              return (
                <tr key={r.locatie_id} className="border-b border-line-2 last:border-b-0">
                  <td className="px-3 py-2.5 text-ink">{r.locatie_nume}</td>
                  <Celula
                    azi={r.cursanti.valoare.toLocaleString('ro-RO')}
                    delta={<Delta valoare={r.cursanti.comparabil ? r.cursanti.valoare - r.cursanti.referinta : null} />}
                  />
                  <Celula
                    azi={r.ocupare.capacitate > 0 ? `${oAzi.toLocaleString('ro-RO')}%` : '—'}
                    delta={
                      <Delta
                        valoare={r.ocupare.comparabil ? Math.round((oAzi - oRef) * 10) / 10 : null}
                        suffix=" pp"
                      />
                    }
                  />
                  <Celula
                    azi={formatRON(r.incasari.valoare)}
                    delta={
                      <Delta
                        valoare={r.incasari.comparabil ? deltaProcent(r.incasari.valoare, r.incasari.referinta) : null}
                        suffix="%"
                      />
                    }
                  />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
