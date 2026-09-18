// Generează secțiunile „coloană cu coloană" din ghidul public de leads, direct
// din textul pe care îl vede recepția în aplicație (src/features/leads/procedura.ts).
//
// De ce: ghidul a stat 15 luni nemodificat și ajunsese să promită lucruri care
// nu mai există (SMS de review la conversie, „fără SMS la A venit"). Câtă vreme
// era scris de mână, nimic nu forța actualizarea. Acum aplicația și ghidul nu
// mai pot spune lucruri diferite.
//
//   npm run gen:ghid          rescrie ghidul
//   npm run gen:ghid -- --check   doar verifică (iese cu 1 dacă e desincronizat)
//
// Restul paginii (povestea Dianei, diagrama, SMS-urile) rămâne scris de mână.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { StatusLead } from '../src/types/db'
import { STATUS_PROCEDURA } from '../src/features/leads/procedura'
import { STATUS_CONFIG } from '../src/features/leads/constants'

const RADACINA = join(dirname(fileURLToPath(import.meta.url)), '..')
const GHID = join(RADACINA, 'public/prezentari/leads-proces.html')

const START = '<!-- gen:statusuri -->'
const STOP = '<!-- /gen:statusuri -->'

// Prezentarea (emoji, ancore) stă aici, nu în procedura.ts: aplicația n-are
// nevoie de ea, iar ancorele trebuie să rămână cele din cuprinsul paginii.
const PREZENTARE: Record<StatusLead, { icon: string; ancora: string; tag?: string }> = {
  nou: { icon: '🆕', ancora: 'nou' },
  contactat: { icon: '📞', ancora: 'contactat' },
  waiting_list: { icon: '⏳', ancora: 'waiting' },
  programat: { icon: '📅', ancora: 'programat' },
  a_venit: { icon: '✅', ancora: 'a-venit' },
  nu_a_venit: { icon: '❌', ancora: 'nu-a-venit' },
  convertit: { icon: '🤝', ancora: 'convertit', tag: 'cap de drum' },
  pierdut: { icon: '🛑', ancora: 'pierdut', tag: 'cap de drum' },
  nurture: { icon: '🌱', ancora: 'nurture' },
}

const COLOANE: StatusLead[] = [
  'nou', 'contactat', 'waiting_list', 'programat',
  'a_venit', 'nu_a_venit', 'convertit', 'pierdut',
]

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function lista(items: string[], bullet: string): string {
  const randuri = items
    .map((t) => `        <li><span class="b">${bullet}</span><span>${esc(t)}</span></li>`)
    .join('\n')
  return `      <ul class="big">\n${randuri}\n      </ul>`
}

function sectiune(status: StatusLead, eyebrow: string): string {
  const p = STATUS_PROCEDURA[status]
  const v = PREZENTARE[status]
  const tag = v.tag ? ` <span class="tag">${v.tag}</span>` : ''
  return [
    `    <section class="block" id="${v.ancora}">`,
    `      <div class="eyebrow">${eyebrow}</div>`,
    `      <h2><span class="ic">${v.icon}</span>${esc(STATUS_CONFIG[status].label)}${tag}</h2>`,
    `      <p class="intro">${esc(p.inseamna)}</p>`,
    '      <h3>Ce faci tu</h3>',
    lista(p.ceFaci, '👉'),
    '      <h3>Ce face aplicația singură</h3>',
    lista(p.aplicatia, '🤖'),
    `      <div class="note"><span class="lbl">Pe unde iese</span>${esc(p.iesiri)}</div>`,
    '      <a class="toplink" href="#top">▲ sus</a>',
    '    </section>',
  ].join('\n')
}

const generat = [
  '',
  '    <!-- Generat din src/features/leads/procedura.ts — `npm run gen:ghid`. NU edita între marcaje. -->',
  ...COLOANE.map((s, i) => sectiune(s, `Coloană cu coloană · ${i + 1}`)),
  sectiune('nurture', 'Restul'),
  '',
].join('\n\n')

const html = readFileSync(GHID, 'utf8')
const i = html.indexOf(START)
const j = html.indexOf(STOP)
if (i === -1 || j === -1) {
  console.error(`Lipsesc marcajele ${START} … ${STOP} din ${GHID}.`)
  process.exit(1)
}

const nou = html.slice(0, i + START.length) + generat + html.slice(j)

if (process.argv.includes('--check')) {
  if (nou !== html) {
    console.error('Ghidul de leads e desincronizat de procedura.ts. Rulează `npm run gen:ghid`.')
    process.exit(1)
  }
  console.log('Ghidul de leads e la zi.')
} else {
  writeFileSync(GHID, nou)
  console.log(
    nou === html
      ? 'Ghidul de leads era deja la zi.'
      : `Ghid actualizat: ${COLOANE.length + 1} secțiuni scrise în ${GHID}.`,
  )
}
