// Import unic: calendarele metodologice 2026-2027 -> programe standard în DB.
//
// Cele 26 de sheet-uri de grupă conțin doar 7 programe distincte (verificat pe conținut):
// grupele cu același nivel × categorie de vârstă × ritm săptămânal primesc exact aceleași
// lecții. Importăm deci 7 `programe_metodologice` (nu 26 de planuri), fiecare cu modulele
// și lecțiile lui; `surse` păstrează ce sheet-uri au produs programul.
//
// Calendarul sezonului (5 module + 4 vacanțe cu date) e identic în toate sheet-urile ->
// un singur set `sezon_calendar`. Se scrie PRIMUL: trigger-ul din DB refuză programele
// active fără calendar.
//
// Sursa e JSON-ul din data/, produs de extract-calendar-metodologic.py (nu citim xlsx
// direct din Node: SheetJS strică emoji-urile și are CVE-uri fără fix pe npm).
//
// Idempotent: id-uri UUID v5 deterministe + `ignoreDuplicates` (re-rularea NU calcă
// editările făcute în UI). `--force` rescrie tot din JSON.
//
// Rulare:  node scripts/migrate/import-programe-metodologice.mjs [--force] [--dry]

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sb, uuid } from './lib.mjs'

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data', 'calendar-metodologic-2026-2027.json')
const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry')

const sursa = JSON.parse(readFileSync(DATA, 'utf8'))
const SEZON = sursa.sezon
const grupeSursa = sursa.grupe

// ---------- date ----------

const LUNI = { ian: 1, feb: 2, mar: 3, apr: 4, mai: 5, iun: 6, iul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

// Anul e implicit din eticheta sezonului: lunile de toamnă aparțin primului an.
function anPentru(luna) {
  const [a1, a2] = SEZON.split('-').map(Number)
  return luna >= 8 ? a1 : a2
}

// „12 sep - 25 oct" | „22 – 28 feb" (prima jumătate poate fi fără lună) | „26 apr – 4 mai"
function parseInterval(text) {
  const [stanga, dreapta] = text.split(/[–-]/).map((s) => s.trim())
  if (!dreapta) return [null, null]
  const luna = (s) => {
    const m = s.match(/([a-zăâîșț]+)\s*$/i)
    return m ? LUNI[m[1].toLowerCase().slice(0, 3)] ?? null : null
  }
  const zi = (s) => {
    const m = s.match(/^(\d{1,2})/)
    return m ? Number(m[1]) : null
  }
  const lunaFinal = luna(dreapta)
  const lunaStart = luna(stanga) ?? lunaFinal
  const ziStart = zi(stanga)
  const ziFinal = zi(dreapta)
  if (!lunaStart || !lunaFinal || !ziStart || !ziFinal) return [null, null]
  const iso = (an, l, z) => `${an}-${String(l).padStart(2, '0')}-${String(z).padStart(2, '0')}`
  return [iso(anPentru(lunaStart), lunaStart, ziStart), iso(anPentru(lunaFinal), lunaFinal, ziFinal)]
}

function tipLectie(titlu) {
  if (titlu.includes('🎭')) return 'spectacol'
  if (titlu.includes('🏆')) return 'concurs'
  return 'lectie'
}

// ---------- denumire program ----------

// „Open" e tratat ca Începători (nota din sheet-ul „Sumar grupe").
const NIVEL_RANG = { Începători: 1, Open: 1, Intermediari: 2, Avansați: 3 }
const NIVEL_CANONIC = { Open: 'Începători' }
const COPII = ['TINY', 'JUNIOR']

function numeProgram(grupe) {
  const nivele = [...new Set(grupe.map((g) => NIVEL_CANONIC[g.nivel] ?? g.nivel))].sort(
    (a, b) => (NIVEL_RANG[a] ?? 9) - (NIVEL_RANG[b] ?? 9)
  )
  const categorii = [...new Set(grupe.map((g) => (COPII.some((c) => g.eticheta.startsWith(c)) ? 'copii' : 'Teen/Varsity')))]
  const zileSet = [...new Set(grupe.map((g) => g.zile))]
  const nrZile = Math.max(...zileSet.map((z) => z.split('+').length))

  let ritm
  if (nrZile === 1) ritm = `1×/săpt. (${zileSet.join(', ')})`
  else if (zileSet.every((z) => /^(Sâ|Du)/.test(z))) ritm = 'weekend'
  else ritm = 'săptămână'

  const nivelText = nivele.join('/')
  const catText = categorii.length === 1 ? ` ${categorii[0]}` : ''
  return { nume: `${nivelText}${catText} · ${ritm}`, nivel: nivelText, sedinte_pe_saptamana: nrZile }
}

// ---------- scriere ----------

async function scrie(tabel, rows) {
  if (!rows.length || DRY) return { inserate: 0 }
  const optiuni = FORCE ? { onConflict: 'id' } : { onConflict: 'id', ignoreDuplicates: true }
  const { data, error } = await sb.from(tabel).upsert(rows, optiuni).select('id')
  if (error) throw new Error(`${tabel}: ${error.message}`)
  return { inserate: data?.length ?? 0 }
}

// ---------- main ----------

console.log(`Grupe în sursă: ${grupeSursa.length} (sezon ${SEZON})`)

// 1) Calendarul sezonului — identic în toate sheet-urile; validăm asumpția.
const ref = grupeSursa[0]
const semnatura = (g) =>
  JSON.stringify([
    g.module.map((m) => [m.numar, m.interval]),
    g.vacante.map((v) => [v.numar, v.interval, v.nota]),
  ])
const divergente = grupeSursa.filter((g) => semnatura(g) !== semnatura(ref))
if (divergente.length) {
  console.warn(`⚠️  ${divergente.length} grupe au alt calendar decât ${ref.sheet}; se folosește primul:`)
  divergente.slice(0, 5).forEach((g) => console.warn(`   - ${g.fisier} / ${g.sheet}`))
}

const randuriCalendar = [
  ...ref.module.map((m) => {
    const [di, df] = parseInterval(m.interval)
    return {
      id: uuid('sezon_calendar', `${SEZON}:modul:${m.numar}`),
      sezon_eticheta: SEZON,
      tip: 'modul',
      numar: m.numar,
      nume: m.nume,
      nota: null,
      data_incepere: di,
      data_final: df,
    }
  }),
  ...ref.vacante.map((v) => {
    const [di, df] = parseInterval(v.interval)
    return {
      id: uuid('sezon_calendar', `${SEZON}:vacanta:${v.numar}`),
      sezon_eticheta: SEZON,
      tip: 'vacanta',
      numar: v.numar,
      nume: v.nume,
      nota: v.nota,
      data_incepere: di,
      data_final: df,
    }
  }),
]

const faraDate = randuriCalendar.filter((r) => !r.data_incepere || !r.data_final)
if (faraDate.length) {
  console.error('❌ Intervale neparsate:', faraDate.map((r) => `${r.nume}`).join(', '))
  process.exit(1)
}

const rezCalendar = await scrie('sezon_calendar', randuriCalendar)
console.log(
  `Calendar ${SEZON}: ${ref.module.length} module + ${ref.vacante.length} vacanțe ` +
    `(${randuriCalendar[0].data_incepere} → ${randuriCalendar[ref.module.length - 1].data_final}), noi: ${rezCalendar.inserate}`
)

// 2) Dedup pe conținutul lecțiilor -> programe standard.
const grupe = new Map()
for (const g of grupeSursa) {
  const hash = createHash('md5')
    .update(g.lectii.map((l) => `${l.nr_sedinta}|${l.titlu}|${l.note ?? ''}`).join('\n'))
    .digest('hex')
    .slice(0, 12)
  if (!grupe.has(hash)) grupe.set(hash, [])
  grupe.get(hash).push(g)
}
console.log(`Programe distincte: ${grupe.size}`)

const programe = []
const module = []
const lectii = []

for (const [hash, membri] of grupe) {
  const sablon = membri[0]
  const { nume, nivel, sedinte_pe_saptamana } = numeProgram(membri)
  const programId = uuid('program_metodologic', hash)

  programe.push({
    id: programId,
    nume,
    sezon_eticheta: SEZON,
    nivel_eticheta: nivel,
    sedinte_pe_saptamana,
    descriere: `${sablon.lectii.length} ședințe · ${membri.length} grupe în ${SEZON}`,
    stare: 'activ',
    surse: membri.map((g) => ({ fisier: g.fisier, sheet: g.sheet, grupa: g.eticheta, zile: g.zile })),
  })

  for (const m of sablon.module) {
    module.push({
      id: uuid('program_modul', `${hash}:${m.numar}`),
      program_id: programId,
      numar: m.numar,
      tema: m.tema,
      subtitlu: m.subtitlu,
    })
  }

  for (const l of sablon.lectii) {
    lectii.push({
      id: uuid('program_lectie', `${hash}:${l.nr_sedinta}`),
      program_id: programId,
      modul_id: uuid('program_modul', `${hash}:${l.modul}`),
      nr_sedinta: l.nr_sedinta,
      titlu: l.titlu,
      note: l.note,
      tip: tipLectie(l.titlu),
    })
  }

  console.log(`  • ${nume} — ${sablon.lectii.length} lecții, ${membri.length} grupe: ${membri.map((g) => g.sheet).join(', ')}`)
}

// Ordinea contează: program (trigger cere calendar) -> module -> lecții (FK pe modul).
const rezProgram = await scrie('programe_metodologice', programe)
const rezModule = await scrie('program_module', module)
const rezLectii = await scrie('program_lectii', lectii)

console.log(
  `\nScris: ${programe.length} programe (noi: ${rezProgram.inserate}), ` +
    `${module.length} module (noi: ${rezModule.inserate}), ` +
    `${lectii.length} lecții (noi: ${rezLectii.inserate})`
)
if (DRY) console.log('(--dry: nimic scris în DB)')
