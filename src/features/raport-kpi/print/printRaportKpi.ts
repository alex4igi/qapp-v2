import { ETICHETA_BANDA, LUNI_LUNG, type RaportKpi } from '../types'

export type VariantaPrint = 'intern' | 'titular' | 'salarizare'

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const lei = (n: number | null | undefined) =>
  `${(n ?? 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`

const STIL = `
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 32px; color: #1a1814; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 2px; }
  .data { color: #888; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
       color: #888; border-bottom: 1px solid #ece8e0; padding: 0 0 6px; }
  td { padding: 8px 0; border-bottom: 1px solid #f2efe9; vertical-align: top; font-size: 13px; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .kpi { font-weight: 600; }
  .cond { color: #666; font-size: 12px; margin-top: 2px; }
  .banda { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .b-peste { color: #1e7d45; } .b-standard { color: #8a6d00; }
  .b-sub { color: #b4232a; } .b-na { color: #888; }
  .total { display: flex; justify-content: space-between; padding: 10px 0; font-size: 15px;
           border-top: 2px solid #1a1814; font-weight: 700; }
  .nota { margin-top: 18px; padding: 10px 14px; background: #f7f5f0; border-radius: 8px;
          font-size: 12px; color: #555; page-break-inside: avoid; }
  .alarma { background: #fdecec; color: #8c1c22; }
  @media print { body { margin: 14mm; } }
`

function antet(r: RaportKpi, titlu: string): string {
  const luna = `${LUNI_LUNG[r.luna - 1]} ${r.anul}`
  return `<h1>${esc(r.grila.titular_nume)}</h1>
<div class="sub">${esc(titlu)} · ${esc(luna)}</div>
<div class="data">${esc(r.grila.locatii ?? '—')} · ${esc(r.grila.post)}</div>`
}

function randuri(r: RaportKpi, cuSume: boolean): string {
  return r.linii
    .map((l) => {
      const val =
        l.tip_prag === 'afirmativ'
          ? l.bifa == null ? '—' : l.bifa ? 'DA' : 'NU'
          : l.valoare == null ? '—' : `${l.valoare}${l.unitate ?? ''}`
      const prag =
        l.tip_prag === 'afirmativ'
          ? 'DA'
          : [
              l.prag_standard == null ? null : `std ${l.prag_standard}${l.unitate ?? ''}`,
              l.prag_peste == null ? null : `peste ${l.prag_peste}${l.unitate ?? ''}`,
            ]
              .filter(Boolean)
              .join(' · ')
      const cond = l.conditie ? `<div class="cond">${esc(l.conditie)}</div>` : ''
      const poarta =
        l.are_poarta && l.poarta_ok === false
          ? '<div class="cond">Poarta de proces nu a fost trecută — linia se plătește cu zero.</div>'
          : ''
      return `<tr>
  <td><span class="kpi">${esc(l.denumire)}</span>${cond}${poarta}</td>
  <td class="num">${l.pondere}%</td>
  <td class="num">${esc(val)}</td>
  <td class="num">${esc(prag)}</td>
  <td class="num"><span class="banda b-${l.banda}">${esc(ETICHETA_BANDA[l.banda])}</span></td>
  ${cuSume ? `<td class="num">${lei(l.suma)}</td>` : ''}
</tr>`
    })
    .join('')
}

function eliminatorii(r: RaportKpi): string {
  if (r.eliminatorii.length === 0) return ''
  const randuri = r.eliminatorii
    .map(
      (e) =>
        `<tr><td>${esc(e.denumire)}</td><td class="num">${
          e.indeplinit == null ? '—' : e.indeplinit ? 'OK' : 'PICAT'
        }</td></tr>`,
    )
    .join('')
  return `<table><thead><tr><th>Eliminatorii</th><th class="num">Stare</th></tr></thead>
<tbody>${randuri}</tbody></table>`
}

/**
 * Trei variante, trei HTML-uri. Regula fermă: varianta TITULARULUI nu
 * construiește deloc fondul total și cota managerului — omisiune la generare,
 * nu ascundere prin CSS. Un `display:none` ajunge în clipboard și în „vezi
 * sursa"; o foaie pe care angajatul o primește în mână nu are voie să conțină
 * cât reține managerul.
 */
export function printRaportKpi(r: RaportKpi, varianta: VariantaPrint) {
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return

  const azi = new Date().toLocaleDateString('ro-RO')
  let corp: string

  if (varianta === 'salarizare') {
    corp = `${antet(r, 'Notă de plată bonus')}
<table><tbody>
  <tr><td>Bonus de plată către titular</td><td class="num">${lei(r.bonus_titular)}</td></tr>
  <tr><td>Cota managerului (${Math.round(r.cota_manager * 100)}%)</td><td class="num">${lei(
    r.fond_total - r.bonus_titular,
  )}</td></tr>
  <tr><td><strong>Fond total de bonus</strong></td><td class="num"><strong>${lei(
    r.fond_total,
  )}</strong></td></tr>
</tbody></table>
${
  r.eliminatoriu_picat
    ? '<div class="nota alarma">Un criteriu eliminatoriu nu a fost îndeplinit: bonusul lunii este zero.</div>'
    : ''
}
${
  r.zile.lucrate != null
    ? `<div class="nota">Pro-rata: ${r.zile.lucrate} zile lucrate din ${
        r.zile.baza ?? r.zile.lucrate
      } cu program.</div>`
    : ''
}
<div class="nota">Generat din qapp la ${esc(azi)}. Raport închis, valori înghețate.</div>`
  } else if (varianta === 'titular') {
    corp = `${antet(r, 'Raport lunar de performanță')}
<table>
  <thead><tr><th>Indicator</th><th class="num">Pondere</th><th class="num">Realizat</th>
  <th class="num">Prag</th><th class="num">Treaptă</th></tr></thead>
  <tbody>${randuri(r, false)}</tbody>
</table>
${eliminatorii(r)}
<div class="total"><span>Bonusul tău pe ${esc(LUNI_LUNG[r.luna - 1])}</span><span>${lei(
      r.bonus_titular,
    )}</span></div>
${
  r.eliminatoriu_picat
    ? '<div class="nota alarma">Un criteriu eliminatoriu nu a fost îndeplinit, deci bonusul lunii este zero. Indicatorii rămân afișați ca să se vadă unde s-a lucrat bine.</div>'
    : ''
}
<div class="nota">Textul de sub fiecare indicator descrie treapta atinsă — ce fel de muncă înseamnă,
nu doar cifra. Generat la ${esc(azi)}.</div>`
  } else {
    corp = `${antet(r, 'Raport KPI — intern')}
<table>
  <thead><tr><th>Indicator</th><th class="num">Pondere</th><th class="num">Realizat</th>
  <th class="num">Prag</th><th class="num">Treaptă</th><th class="num">Sumă</th></tr></thead>
  <tbody>${randuri(r, true)}</tbody>
</table>
${eliminatorii(r)}
<table><tbody>
  <tr><td>Sumă brută a liniilor</td><td class="num">${lei(r.bonus_brut)}</td></tr>
  <tr><td>Redistribuire (pondere evaluată ${r.pondere_evaluata}% din ${
    r.pondere_luna
  }%)</td><td class="num">×${r.factor_redistribuire}</td></tr>
  ${
    r.zile.lucrate != null
      ? `<tr><td>Pro-rata zile lucrate (${r.zile.lucrate}/${
          r.zile.baza ?? r.zile.lucrate
        })</td><td class="num">×${r.zile.prorata}</td></tr>`
      : ''
  }
  <tr><td>Cota managerului</td><td class="num">${Math.round(r.cota_manager * 100)}%</td></tr>
  <tr><td><strong>Fond total</strong></td><td class="num"><strong>${lei(
    r.fond_total,
  )}</strong></td></tr>
</tbody></table>
<div class="total"><span>Bonus titular</span><span>${lei(r.bonus_titular)}</span></div>
${
  r.avertismente.length > 0
    ? `<div class="nota">${r.avertismente.map((a) => esc(a)).join('<br>')}</div>`
    : ''
}
<div class="nota">Σ ponderi configurate: ${r.pondere_totala_configurata}%. Generat la ${esc(
      azi,
    )}.</div>`
  }

  w.document.write(`<!doctype html><html lang="ro"><head><meta charset="utf-8">
<title>Raport KPI — ${esc(r.grila.titular_nume)} — ${esc(LUNI_LUNG[r.luna - 1])} ${r.anul}</title>
<style>${STIL}</style></head><body>${corp}</body></html>`)
  w.document.close()
  w.focus()
  w.print()
}
