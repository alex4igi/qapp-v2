import type { RaportNetopia } from './api'
import { dataRo, etichetaLuna, lei, netPlata, tipPlata, totaluri, verificari } from './calcul'

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const FIRMA = 'Quasar Dance Studio SRL · CUI 49361270'

/**
 * Raportul lunar al plăților online pentru contabilitate. Fereastră nouă → print →
 * „Salvează ca PDF", ca la evaluări și la playbook-ul de spectacol.
 */
export function printRaportNetopia(r: RaportNetopia) {
  const w = window.open('', '_blank', 'width=1100,height=900')
  if (!w) return

  const t = totaluri(r)
  const luna = etichetaLuna(r.luna.slice(0, 7))
  const generat = new Date().toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const ver = verificari(r)

  const randuriPlati = r.plati
    .map((p, i) => {
      const net = netPlata(p)
      const factura = p.factura
        ? `${esc(p.factura)}${p.factura_status && p.factura_status !== 'Emisa' ? ` <span class="warn">(${esc(p.factura_status)})</span>` : ''}`
        : '<span class="warn">fără factură</span>'
      return `<tr>
        <td class="num">${i + 1}</td>
        <td class="nowrap">${dataRo(p.data)}<div class="mic">${esc(p.ora)}</div></td>
        <td>${esc(p.platitor)}</td>
        <td>${esc(p.membru)}</td>
        <td>${esc(p.descriere)}<div class="mic">${tipPlata(p)} · ${esc(p.order_ref)}</div></td>
        <td class="nowrap">${factura}${p.facturat_catre ? `<div class="mic">către ${esc(p.facturat_catre)}</div>` : ''}</td>
        <td class="num">${lei(p.suma)}</td>
        <td class="num">${p.batch_id != null ? lei((p.comision ?? 0) + (p.tva_comision ?? 0)) : '—'}</td>
        <td class="num">${lei(net)}</td>
        <td class="nowrap">${p.batch_id != null ? `${dataRo(p.data_virare)}<div class="mic">lot ${p.batch_id}</div>` : '<span class="mic">nevirat / fișier lipsă</span>'}</td>
      </tr>`
    })
    .join('')

  const randuriLoturi = r.loturi
    .map((l) => {
      const potrivire =
        l.extras_suma == null
          ? '<span class="mic">extras neîncărcat</span>'
          : Math.round(l.extras_suma * 100) === Math.round(l.net * 100)
            ? `✓ ${lei(l.extras_suma)}<div class="mic">${dataRo(l.extras_data)}</div>`
            : `<span class="warn">${lei(l.extras_suma)}</span><div class="mic">${dataRo(l.extras_data)}</div>`
      return `<tr>
        <td>${l.batch_id}</td>
        <td class="nowrap">${dataRo(l.data_platii)}</td>
        <td class="num">${l.nr_plati}</td>
        <td class="num">${lei(l.procesat)}</td>
        <td class="num">${lei(l.comision_tranzactii)}</td>
        <td class="num">${lei(l.taxa_transfer + l.tva)}</td>
        <td class="num"><strong>${lei(l.net)}</strong></td>
        <td class="nowrap">${potrivire}</td>
      </tr>`
    })
    .join('')

  const randuriRestituiri = r.restituiri
    .map(
      (x) => `<tr>
        <td class="nowrap">${dataRo(x.data)}</td>
        <td>${esc(x.membru)}<div class="mic">${esc(x.order_ref)}</div></td>
        <td>${esc(x.motiv)}</td>
        <td>${esc(x.factura)}</td>
        <td>${x.fgo_storno ? esc(x.fgo_storno) : x.fgo_status === 'de_stornat_manual' ? '<span class="warn">de stornat manual</span>' : esc(x.fgo_status ?? '—')}</td>
        <td>${x.status === 'efectuata' ? 'efectuată' : x.status === 'in_curs' ? '<span class="warn">în curs</span>' : esc(x.status)}</td>
        <td class="num">−${lei(x.suma)}</td>
      </tr>`,
    )
    .join('')

  w.document.write(`<!doctype html><html lang="ro"><head><meta charset="utf-8">
<title>Plăți online Netopia — ${esc(luna)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; margin: 24px; color: #1a1814; font-size: 11px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 22px 0 6px; }
  .sub { color: #666; font-size: 11px; margin-bottom: 14px; }
  .kpi { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
  .kpi div { border: 1px solid #e4dfd5; border-radius: 6px; padding: 6px 10px; min-width: 120px; }
  .kpi b { display: block; font-size: 15px; }
  .kpi span { color: #666; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; color: #555; font-weight: 600; border-bottom: 1.5px solid #1a1814; padding: 4px 5px; }
  td { padding: 4px 5px; border-bottom: 1px solid #ece8e0; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tfoot td { border-top: 1.5px solid #1a1814; border-bottom: none; font-weight: 700; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  .nowrap { white-space: nowrap; }
  .mic { color: #888; font-size: 9.5px; }
  .warn { color: #b42318; font-weight: 600; }
  .ver { margin: 0; padding-left: 16px; }
  .ver li { margin-bottom: 3px; }
  .ok { color: #1a7f37; }
  .nota { margin-top: 18px; color: #777; font-size: 9.5px; line-height: 1.5; }
</style></head>
<body>
  <h1>Plăți online prin Netopia — ${esc(luna)}</h1>
  <div class="sub">${FIRMA} · generat ${esc(generat)}</div>

  <div class="kpi">
    <div><b>${t.nrPlati}</b><span>plăți confirmate</span></div>
    <div><b>${lei(t.incasat)} lei</b><span>încasat (brut, facturat)</span></div>
    <div><b>${t.nrFacturate} / ${t.nrPlati}</b><span>cu factură FGO</span></div>
    <div><b>${lei(Math.abs(t.comisioane))} lei</b><span>comisioane pe tranzacții${t.nrDecontate < t.nrPlati ? ` (${t.nrDecontate} din ${t.nrPlati} plăți)` : ''}</span></div>
    <div><b>${lei(t.netDecontat)} lei</b><span>net după comisioane${t.nrDecontate < t.nrPlati ? ' (plățile virate)' : ''}</span></div>
    ${t.restituit ? `<div><b>−${lei(t.restituit)} lei</b><span>restituit clienților</span></div>` : ''}
  </div>

  <h2>Plățile lunii</h2>
  <table>
    <thead><tr>
      <th class="num">#</th><th>Data</th><th>Plătitor (cont portal)</th><th>Pentru</th><th>Ce s-a plătit</th>
      <th>Factură FGO</th><th class="num">Sumă</th><th class="num">Comision</th><th class="num">Net</th><th>Virat de Netopia</th>
    </tr></thead>
    <tbody>${randuriPlati || '<tr><td colspan="10">Nicio plată online în această lună.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="6">Total</td>
      <td class="num">${lei(t.incasat)}</td>
      <td class="num">${t.nrDecontate ? lei(t.comisioane) : '—'}</td>
      <td class="num">${t.nrDecontate ? lei(t.netDecontat) : '—'}</td>
      <td></td>
    </tr></tfoot>
  </table>

  ${
    r.loturi.length
      ? `<h2>Virările Netopia în cont (loturile în care au intrat plățile lunii)</h2>
  <table>
    <thead><tr>
      <th>Lot (BatchId)</th><th>Data virării</th><th class="num">Plăți</th><th class="num">Procesat</th>
      <th class="num">Comisioane tranzacții</th><th class="num">Taxă transfer + TVA</th><th class="num">Net virat</th><th>Extras ING</th>
    </tr></thead>
    <tbody>${randuriLoturi}</tbody>
  </table>
  <div class="mic" style="margin-top:4px">Un lot poate cuprinde și plăți din luna vecină. Taxa de transfer reținută într-un lot e pentru virarea lotului anterior.</div>`
      : ''
  }

  ${
    r.restituiri.length
      ? `<h2>Restituiri către clienți</h2>
  <table>
    <thead><tr><th>Data</th><th>Membru</th><th>Motiv</th><th>Factura inițială</th><th>Storno FGO</th><th>Stare</th><th class="num">Sumă</th></tr></thead>
    <tbody>${randuriRestituiri}</tbody>
  </table>`
      : ''
  }

  <h2>De verificat</h2>
  ${
    ver.length
      ? `<ul class="ver">${ver.map((v) => `<li${v.nivel === 'atentie' ? ' class="warn"' : ''}>${esc(v.text)}</li>`).join('')}</ul>`
      : '<p class="ok">✓ Toate plățile au factură, apar în deconturile Netopia cu aceeași sumă, iar virările se potrivesc cu extrasul.</p>'
  }

  <div class="nota">
    Sursa: plățile confirmate în aplicația Qapp (data = ziua plății, ora României) și fișierele de decont Netopia încărcate${
      r.ultim_lot ? ` (ultimul lot: ${dataRo(r.ultim_lot)})` : ''
    }. „Plătitor" = titularul contului din portalul de membri; „Pentru" = membrul pentru care s-a plătit.
    Comisionul = comisionul fix + cel procentual reținute de Netopia pe fiecare tranzacție.
  </div>
  <script>window.onload = () => window.print()</script>
</body></html>`)
  w.document.close()
}
