import type { Spectacol } from '@/types/db'
import type { ActCuPerformeri } from './api/lineup'
import type { QuickChangeWarning } from './helpers'

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  )

// Generează un desfășurător printabil (deschide o fereastră nouă → print → „Salvează ca PDF").
// Fără dependență de generare PDF: folosim print-ul browserului, ca la orice document A4.
export function printPlaybook(
  spectacol: Spectacol,
  acte: ActCuPerformeri[],
  warnings: QuickChangeWarning[],
) {
  const w = window.open('', '_blank', 'width=900,height=1200')
  if (!w) return

  const subtitle = [spectacol.data, spectacol.ora, spectacol.locatie]
    .filter(Boolean)
    .join(' · ')

  const acteHtml = acte
    .map((a) => {
      const meta = [
        a.cursNume,
        a.durata_min != null ? `${a.durata_min} min` : null,
        a.responsabilNume ? `resp. ${a.responsabilNume}` : null,
      ]
        .filter(Boolean)
        .map((m) => esc(String(m)))
        .join(' · ')
      const performeri = a.performeri.length
        ? a.performeri
            .map((p) => esc(`${p.nume} ${p.prenume ?? ''}`.trim()))
            .join(', ')
        : '<em>—</em>'
      return `
        <div class="act">
          <div class="act-h">
            <span class="num">${a.ordine + 1}</span>
            <span class="titlu">${esc(a.titlu)}</span>
          </div>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
          <div class="perf">${performeri}</div>
          ${a.note ? `<div class="note">${esc(a.note)}</div>` : ''}
        </div>`
    })
    .join('')

  const warnHtml = warnings.length
    ? `<div class="warns">
         <h2>⚡ Schimbări rapide</h2>
         <ul>${warnings
           .map(
             (wn) =>
               `<li><strong>${esc(wn.nume)}</strong> — actul ${wn.actA.pos} („${esc(
                 wn.actA.titlu,
               )}") → actul ${wn.actB.pos} („${esc(wn.actB.titlu)}")${
                 wn.gap === 1 ? ' <em>(consecutiv)</em>' : ''
               }</li>`,
           )
           .join('')}</ul>
       </div>`
    : ''

  w.document.write(`<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>Desfășurător — ${esc(
    spectacol.nume,
  )}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 18px; }
  .act { border-bottom: 1px solid #e5e5e5; padding: 8px 0; page-break-inside: avoid; }
  .act-h { display: flex; align-items: baseline; gap: 8px; }
  .num { font-weight: 700; min-width: 22px; }
  .titlu { font-weight: 600; font-size: 15px; }
  .meta { color: #666; font-size: 12px; margin: 2px 0 0 30px; }
  .perf { font-size: 13px; margin: 3px 0 0 30px; }
  .note { color: #444; font-size: 12px; font-style: italic; margin: 3px 0 0 30px; }
  .warns { margin-top: 24px; padding: 12px 16px; background: #fff7d6; border: 1px solid #f0d000; border-radius: 8px; page-break-inside: avoid; }
  .warns h2 { font-size: 15px; margin: 0 0 6px; }
  .warns ul { margin: 0; padding-left: 18px; font-size: 13px; }
  @media print { body { margin: 12mm; } }
</style></head>
<body>
  <h1>${esc(spectacol.nume)}</h1>
  <div class="sub">${esc(subtitle)}</div>
  ${acteHtml || '<p><em>Niciun act în lineup.</em></p>'}
  ${warnHtml}
  <script>window.onload = () => window.print()</script>
</body></html>`)
  w.document.close()
}
