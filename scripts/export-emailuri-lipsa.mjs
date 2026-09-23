// CSV pentru recepție: membrii activi care NU pot primi cont de portal pentru că emailul
// din fișă lipsește sau e folosit la mai multe fișe. Grupat pe locații (după grupele din
// sezonul activ). Re-rulabil — lista se scurtează pe măsură ce recepția completează fișele.
//
//   node scripts/export-emailuri-lipsa.mjs [--out docs/emailuri-lipsa-portal-receptie.csv]
//
// Scrie și un .html de printat lângă .csv. PDF-ul (fișa de sunat) se face din el cu Chromium:
//   "$HOME/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
//     --headless --disable-gpu --no-pdf-header-footer \
//     --print-to-pdf=docs/emailuri-lipsa-portal-receptie.pdf file://$PWD/docs/emailuri-lipsa-portal-receptie.html
//
// CSV cu `;` și BOM, ca Excel-ul românesc să-l deschidă pe coloane, cu diacritice.
// Perechea lui: scripts/provision-parola-comuna.mjs (creează conturile).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const OUT = arg('out', fileURLToPath(new URL('../docs/emailuri-lipsa-portal-receptie.csv', import.meta.url)))

async function all(table, cols, filter) {
  let out = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    out = out.concat(data)
    if (data.length < 1000) return out
  }
}

const { data: sezon } = await db.from('sezoane').select('id, numele_sezonului').eq('activ', true).single()
const clienti = await all('clienti', 'id, nume, prenume, email, telefon, familia, auth_user_id', (q) => q.eq('status', 'Activ'))
const familii = await all('familii', 'id, nume_familie, email, telefon, auth_user_id')
const locatii = await all('locatii', 'id, nume')
const cursuri = await all('cursuri', 'id, numele, locatie', (q) => q.eq('sezon', sezon.id))
const inrolari = await all('enrollments', 'client, cursul', (q) => q.eq('sezon_id', sezon.id).is('data_reziliere', null))

const locById = new Map(locatii.map((l) => [l.id, l.nume]))
const cursById = new Map(cursuri.map((c) => [c.id, c]))
const famById = new Map(familii.map((f) => [f.id, f]))
const nume = (c) => `${c.nume ?? ''} ${c.prenume ?? ''}`.replace(/\s+/g, ' ').trim()

const perClient = new Map()
for (const e of inrolari) {
  const curs = cursById.get(e.cursul)
  if (!curs || !e.client) continue
  if (!perClient.has(e.client)) perClient.set(e.client, { loc: new Set(), grupe: new Set() })
  perClient.get(e.client).loc.add(locById.get(curs.locatie) ?? '—')
  perClient.get(e.client).grupe.add(curs.numele)
}

// O țintă = o familie (un cont pentru toți frații) sau un client fără familie.
const targets = new Map()
for (const c of clienti) {
  const f = c.familia ? famById.get(c.familia) : null
  const key = f ? `f:${f.id}` : `c:${c.id}`
  if (!targets.has(key)) {
    targets.set(key, {
      kind: f ? 'familie' : 'client',
      id: f ? f.id : c.id,
      label: f ? `Fam. ${(f.nume_familie ?? '?').trim()}` : nume(c),
      email: (f?.email ?? '').trim().toLowerCase() || null,
      tel: (f?.telefon ?? '').trim(),
      areCont: !!f?.auth_user_id,
      membriFaraCont: 0,
      membri: [], loc: new Set(), grupe: new Set(),
    })
  }
  const t = targets.get(key)
  t.membri.push(nume(c))
  if (!t.email && c.email?.trim()) t.email = c.email.trim().toLowerCase()
  if (!t.tel && c.telefon?.trim()) t.tel = c.telefon.trim()
  // Adulții din pilotul UNIQ au cont pe client, deși stau într-o familie de un membru.
  if (!c.auth_user_id) t.membriFaraCont++
  const p = perClient.get(c.id)
  if (p) { p.loc.forEach((l) => t.loc.add(l)); p.grupe.forEach((g) => t.grupe.add(g)) }
}

const faraCont = [...targets.values()].filter((t) => !t.areCont && t.membriFaraCont > 0)
const emailCount = {}
for (const t of faraCont) if (t.email) emailCount[t.email] = (emailCount[t.email] ?? 0) + 1
const list = faraCont.filter((t) => !t.email || emailCount[t.email] > 1)

// Observații calculate din date, ca să nu se învechească: telefon invalid, telefon comun
// (frați necuplați la aceeași familie), email comun.
const digits = (s) => (s ?? '').replace(/\D/g, '')
const telValid = (s) => digits(s).length >= 9
const perTel = {}
for (const t of list) if (telValid(t.tel)) (perTel[digits(t.tel).slice(-9)] ??= []).push(t)
const perEmail = {}
for (const t of list) if (t.email) (perEmail[t.email] ??= []).push(t)
// Fișe dublate: același nume de membru, pe fișe diferite (ex. același copil înscris de două ori).
const fara = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const perNume = {}
for (const t of list) for (const m of t.membri) (perNume[fara(m)] ??= new Set()).add(t)

for (const t of list) {
  const obs = []
  if (!telValid(t.tel)) obs.push(`Telefon lipsă sau invalid în fișă („${t.tel || 'gol'}”) — luați și numărul`)
  else if (/^7\d{8}$/.test(digits(t.tel))) obs.push('Telefonul din fișă e scris fără 0 la început — corectați-l în fișă')
  const colegiTel = (perTel[digits(t.tel).slice(-9)] ?? []).filter((o) => o !== t)
  if (colegiTel.length) obs.push(`Același telefon cu ${colegiTel.map((o) => o.label).join(', ')} — dacă sunt frați, legați-i în aceeași familie`)
  const dubluri = t.membri.filter((m) => (perNume[fara(m)] ?? new Set()).size > 1)
  if (dubluri.length) obs.push(`Posibilă fișă dublată: ${dubluri.join(', ')} apare pe mai multe fișe — verificați data nașterii`)
  const colegiEmail = (perEmail[t.email] ?? []).filter((o) => o !== t)
  if (colegiEmail.length) obs.push(`Același email cu ${colegiEmail.map((o) => o.label).join(', ')} — unul are emailul greșit, ori sunt frați de legat în aceeași familie`)
  t.obs = obs.join(' · ')
  t.problema = t.email ? 'Același email la mai multe fișe' : 'Fără email'
  t.locLabel = t.loc.size ? [...t.loc].sort().join(' + ') : 'Fără grupă în sezonul curent'
}

const ordine = ['Galeriile Stefan cel Mare', 'Nicolina', 'Quasar 4 Kids']
const rang = (l) => { const i = ordine.indexOf(l.split(' + ')[0]); return i < 0 ? 9 : i }
list.sort((a, b) => rang(a.locLabel) - rang(b.locLabel) || a.locLabel.localeCompare(b.locLabel, 'ro') || a.label.localeCompare(b.label, 'ro'))

const perLoc = {}
for (const t of list) perLoc[t.locLabel] = (perLoc[t.locLabel] ?? 0) + 1

const rows = [['Locație', 'Grupă', 'Tip fișă', 'Nume', 'Membri activi', 'Telefon', 'Email în fișă acum', 'Problemă', 'Email corect (de completat)', 'Observații', 'Link fișă']]
for (const t of list) {
  rows.push([
    t.locLabel, [...t.grupe].sort().join(' | '), t.kind === 'familie' ? 'Familie' : 'Client',
    t.label, t.membri.join(', '), t.tel || 'LIPSĂ', t.email ?? '', t.problema, '', t.obs,
    `https://qapp-v2.vercel.app/${t.kind === 'familie' ? 'familii' : 'clienti'}/${t.id}`,
  ])
}

const note = [
  [],
  ['NOTIȚE'],
  ['La ce folosește', 'Sunt membrii activi care NU pot primi cont pe portalul de membri, pentru că în fișă nu avem un email bun.'],
  ['Ce aveți de făcut', 'Sunați și cereți adresa de email a părintelui sau a adultului, apoi completați-o direct în fișa din aplicație (linkul din ultima coloană). Coloana „Email corect” e doar ciorna voastră.'],
  ['Un cont per familie', 'Frații legați într-o familie primesc UN singur cont, pe emailul familiei. Frații nelegați primesc conturi separate — de aceea semnalăm în „Observații” fișele cu același telefon.'],
  ['Același email la două fișe', 'Portalul nu acceptă aceeași adresă la două conturi. Ori una dintre fișe are emailul greșit, ori sunt frați care trebuie legați în aceeași familie.'],
  ['Emailuri false', 'Adrese de tipul „s@yahoo.com” au fost puse doar ca să nu rămână câmpul gol. Se înlocuiesc cu adresa adevărată.'],
  ['Când primesc oamenii contul', 'Deocamdată nimeni nu primește date de acces. Conturile se fac mai târziu, când decide Alex. Voi doar completați emailurile în fișe.'],
  [],
  ['TOTALURI'],
  ...Object.entries(perLoc).map(([l, n]) => [l, String(n)]),
  ['Total', String(list.length)],
  ['Fără email', String(list.filter((t) => !t.email).length)],
  ['Email dublat', String(list.filter((t) => t.email).length)],
  ['Sezon', sezon.numele_sezonului],
  ['Generat', new Date().toISOString().slice(0, 10)],
]


// ---- HTML de printat (Chromium --print-to-pdf îl face PDF) ----
const HOUT = OUT.replace(/\.csv$/, '.html')
const h = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const telFrumos = (t) => {
  const d = digits(t)
  const n = d.startsWith('40') && d.length === 11 ? `0${d.slice(2)}`
    : /^7\d{8}$/.test(d) ? `0${d}` : d
  return /^0\d{9}$/.test(n) ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : (t || 'LIPSĂ')
}
const locFrumos = (l) => l.replace('Galeriile Stefan cel Mare', 'Galeriile Ștefan cel Mare')
const azi = new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })
const sectiuni = ordine.concat(Object.keys(perLoc).filter((l) => !ordine.includes(l)))
  .filter((l) => perLoc[l])
  .map((loc) => {
    const ai = list.filter((t) => t.locLabel === loc)
    return `<section class="loc">
      <h2><span>${h(locFrumos(loc))}</span><em>${ai.length} de sunat</em></h2>
      ${ai.map((t) => `<article${t.obs ? ' class="cu-nota"' : ''}>
        <div class="sus"><span class="nume">${h(t.label)}</span><span class="tel">${h(telFrumos(t.tel))}</span></div>
        <div class="meta">${h([...t.grupe].sort().join(' · ') || 'fără grupă în sezon')}${t.kind === 'familie' ? ` — ${h(t.membri.join(', '))}` : ''}</div>
        ${t.email ? `<div class="meta">în fișă acum: <b>${h(t.email)}</b> (aceeași adresă la mai multe fișe)</div>` : ''}
        <div class="scrie"><span>Email:</span><i></i></div>
        ${t.obs ? `<div class="nota">${h(t.obs)}</div>` : ''}
      </article>`).join('')}
    </section>`
  }).join('')

const htmlDoc = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Emailuri lipsă — portal membri</title>
<style>
  @page { size: A4; margin: 13mm 12mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.45 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; }
  .cap { background: #000; color: #fff; padding: 14px 16px; border-radius: 4px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .cap h1 { margin: 0; font-size: 17pt; letter-spacing: -0.2px; }
  .cap h1 b { background: #FFD600; color: #000; padding: 0 6px; border-radius: 2px; }
  .cap p { margin: 4px 0 0; font-size: 9pt; color: #cfcfcf; }
  .cap .nr { text-align: right; font-size: 9pt; color: #cfcfcf; white-space: nowrap; }
  .cap .nr b { display: block; font-size: 20pt; color: #FFD600; line-height: 1.1; }
  .brief { margin: 12px 0 16px; padding: 10px 14px; border: 1px solid #e5e5e5; border-left: 4px solid #FFD600; border-radius: 3px; background: #fcfcfc; }
  .brief h3 { margin: 0 0 5px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.6px; }
  .brief ol { margin: 0; padding-left: 18px; font-size: 9.5pt; }
  .brief li { margin: 2px 0; }
  .loc { break-inside: auto; margin-bottom: 14px; }
  .loc h2 { display: flex; justify-content: space-between; align-items: baseline; margin: 16px 0 8px; padding: 5px 10px; background: #FFD600; border-radius: 3px; font-size: 11.5pt; text-transform: uppercase; letter-spacing: 0.4px; break-after: avoid; }
  .loc h2 em { font-style: normal; font-size: 9pt; font-weight: 600; }
  article { break-inside: avoid; padding: 7px 10px 8px; border-bottom: 1px solid #ececec; }
  article.cu-nota { background: #fffdf2; }
  .sus { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .nume { font-weight: 700; font-size: 11pt; }
  .nume::before { content: "☐"; margin-right: 7px; font-weight: 400; color: #999; }
  .tel { font-variant-numeric: tabular-nums; font-size: 11pt; white-space: nowrap; }
  .meta { font-size: 8.8pt; color: #666; margin: 1px 0 0 19px; }
  .scrie { display: flex; align-items: baseline; gap: 7px; margin: 5px 0 0 19px; font-size: 8.8pt; color: #666; }
  .scrie i { flex: 1; border-bottom: 1px dotted #b0b0b0; height: 11px; }
  .nota { margin: 4px 0 0 19px; font-size: 8.6pt; color: #8a6d00; }
  .nota::before { content: "⚠ "; }
  .final { break-before: page; }
  .final h2 { font-size: 12pt; margin: 0 0 10px; padding-bottom: 5px; border-bottom: 2px solid #000; }
  .final dl { margin: 0; font-size: 9.5pt; }
  .final dt { font-weight: 700; margin-top: 9px; }
  .final dd { margin: 1px 0 0; color: #333; }
  table.tot { margin-top: 16px; border-collapse: collapse; font-size: 9.5pt; }
  table.tot td { padding: 3px 14px 3px 0; border-bottom: 1px solid #eee; }
  table.tot th { text-align: left; padding-bottom: 4px; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.6px; color: #666; border-bottom: 1px solid #ddd; }
  table.tot td:last-child { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .semnat { margin-top: 18px; font-size: 8.5pt; color: #888; }
</style></head><body>
<header class="cap">
  <div><h1><b>Quasar</b> — emailuri lipsă pentru portal</h1>
  <p>${h(sezon.numele_sezonului)} · listă de sunat pentru recepție · generată ${h(azi)}</p></div>
  <div class="nr"><b>${list.length}</b>de completat</div>
</header>
<div class="brief">
  <h3>Ce avem de făcut</h3>
  <ol>
    <li>Sunăm și cerem adresa de email a părintelui sau a adultului.</li>
    <li>O scriem pe foaie, apoi o completăm în fișa din aplicație.</li>
    <li>Bifăm căsuța când e gata.</li>
    <li>Nimeni nu primește încă date de acces — deocamdată doar strângem emailurile.</li>
  </ol>
</div>
${sectiuni}
<section class="final">
  <h2>Notițe</h2>
  <dl>
    <dt>De ce lista asta</dt><dd>Sunt membrii activi care nu pot primi cont pe portalul de membri, pentru că în fișă nu avem o adresă de email bună.</dd>
    <dt>Un cont de familie</dt><dd>Frații legați într-o familie primesc un singur cont, pe emailul familiei. Frații nelegați primesc conturi separate — de aceea semnalăm fișele cu același telefon.</dd>
    <dt>Același email la două fișe</dt><dd>Portalul nu acceptă aceeași adresă la două conturi. Ori una dintre fișe are emailul greșit, ori sunt frați care trebuie legați în aceeași familie.</dd>
    <dt>Emailuri false</dt><dd>Adrese de tipul „s@yahoo.com” au fost puse doar ca să nu rămână câmpul gol. Se înlocuiesc cu adresa adevărată.</dd>
    <dt>Telefoane invalide</dt><dd>Unde telefonul e trecut greșit în fișă, luăm și numărul corect.</dd>
    <dt>Când primesc oamenii contul</dt><dd>Mai târziu, când decide Alex. Până atunci nu trimitem nimic.</dd>
  </dl>
  <table class="tot">
    <tr><th colspan="2">Totaluri</th></tr>
    ${Object.entries(perLoc).map(([l, n]) => `<tr><td>${h(locFrumos(l))}</td><td>${n}</td></tr>`).join('')}
    <tr><td>Fără email în fișă</td><td>${list.filter((t) => !t.email).length}</td></tr>
    <tr><td>Același email la mai multe fișe</td><td>${list.filter((t) => t.email).length}</td></tr>
    <tr><td><b>Total</b></td><td>${list.length}</td></tr>
  </table>
  <p class="semnat">Lista se reface oricând din aplicație; pe măsură ce completați emailurile, numele dispar de pe ea.</p>
</section>
</body></html>`
writeFileSync(HOUT, htmlDoc)

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
writeFileSync(OUT, '﻿' + rows.concat(note).map((r) => r.map(esc).join(';')).join('\r\n'))
console.log(`${OUT}\n  ${list.length} rânduri`, perLoc)
