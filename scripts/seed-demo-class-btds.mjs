// Creează cele 16 clase demo („DEMO Class") din campania Back to Dance School
// (7–11 septembrie 2026, quasardance.ro/back-to-dance-school) ca evenimente, ca
// recepția să poată programa lead-uri pe ele din LeadModal.
// Idempotent — cheia e (data, ora, locatia); rerularea actualizează, nu dublează.
//
//   node scripts/seed-demo-class-btds.mjs         # dry-run
//   node scripts/seed-demo-class-btds.mjs --apply # aplică

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const APPLY = process.argv.includes('--apply')
const SCM = 'Galeriile Stefan cel Mare'
const NIC = 'Nicolina'
const DESCRIERE =
  'Back to Dance School — clasă demo gratuită. Fără plată și fără obligația de a te înscrie.'
const NOTITE = 'Campanie: quasardance.ro/back-to-dance-school (7–11 sept 2026)'

// Orarul exact de pe pagina campaniei. `teacher` = prenumele afișat public.
const SLOTURI = [
  { data: '2026-09-07', ora: '17:00', loc: SCM, grupa: 'Junior',  curs: 'Street Dance', teacher: 'Eva' },
  { data: '2026-09-07', ora: '18:30', loc: SCM, grupa: 'Teens',   curs: 'Street Dance', teacher: 'Eva' },
  { data: '2026-09-08', ora: '16:30', loc: SCM, grupa: 'Tiny',    curs: 'Street Dance', teacher: 'Ioana' },
  { data: '2026-09-08', ora: '18:00', loc: SCM, grupa: 'Junior',  curs: 'Street Dance', teacher: 'Ioana' },
  { data: '2026-09-09', ora: '17:00', loc: SCM, grupa: null,      curs: 'KPOP Dance',   teacher: 'Laura' },
  { data: '2026-09-09', ora: '18:30', loc: SCM, grupa: 'Varsity', curs: 'Street Dance', teacher: 'Bianca' },
  { data: '2026-09-10', ora: '17:00', loc: SCM, grupa: 'Varsity', curs: 'Street Dance', teacher: 'Adrian' },
  { data: '2026-09-10', ora: '18:30', loc: SCM, grupa: 'Teens',   curs: 'Street Dance', teacher: 'Adrian' },
  { data: '2026-09-11', ora: '17:00', loc: SCM, grupa: null,      curs: 'KPOP Dance',   teacher: 'Giulia' },
  { data: '2026-09-09', ora: '17:30', loc: NIC, grupa: 'Junior',  curs: 'Gimnastica acrobatica', teacher: 'Alin' },
  { data: '2026-09-09', ora: '18:30', loc: NIC, grupa: 'Varsity', curs: 'Gimnastica acrobatica', teacher: 'Alin' },
  { data: '2026-09-09', ora: '19:30', loc: NIC, grupa: 'Teens',   curs: 'Street Dance', teacher: 'Alin' },
  { data: '2026-09-10', ora: '17:30', loc: NIC, grupa: 'Junior',  curs: 'Street Dance', teacher: 'Ana' },
  { data: '2026-09-10', ora: '18:30', loc: NIC, grupa: 'Tiny',    curs: 'Street Dance', teacher: 'Ana' },
  { data: '2026-09-10', ora: '19:30', loc: NIC, grupa: null,      curs: 'KPOP Dance',   teacher: 'Ana' },
  { data: '2026-09-11', ora: '18:30', loc: NIC, grupa: 'Varsity', curs: 'Street Dance', teacher: 'Mara' },
]

const numeSlot = (s) =>
  `DEMO ${[s.grupa, s.curs].filter(Boolean).join(' ')} (${s.teacher})`

// Prenumele publice → id de teacher. Ambiguu (2 × Laura) sau lipsă ⇒ null:
// organizatorul se alege manual din /evenimente, nu ghicim.
const { data: teacheri, error: tErr } = await db
  .from('teacheri').select('id, nume, prenume')
if (tErr) { console.error(tErr); process.exit(1) }
function teacherId(prenume) {
  const hits = teacheri.filter((t) =>
    (t.prenume ?? '').trim().toLowerCase() === prenume.toLowerCase())
  if (hits.length === 1) return hits[0].id
  console.log(`  ⚠ organizator nesetat pentru „${prenume}" (${hits.length} potriviri)`)
  return null
}

const { data: existente, error: eErr } = await db
  .from('evenimente')
  .select('id, nume_eveniment, data, ora, locatia, tip')
  .gte('data', '2026-09-07').lte('data', '2026-09-11')
if (eErr) { console.error(eErr); process.exit(1) }

const key = (d, o, l) => `${d}|${(o ?? '').slice(0, 5)}|${l ?? ''}`
const byKey = new Map((existente ?? []).map((e) => [key(e.data, e.ora, e.locatia), e]))

let create = 0, update = 0
for (const s of SLOTURI) {
  const row = {
    nume_eveniment: numeSlot(s),
    tip: 'DEMO Class',
    descriere: DESCRIERE,
    data: s.data,
    ora: s.ora,
    locatia: s.loc,
    organizator: teacherId(s.teacher),
    status: 'Urmator',
    notite: NOTITE,
    public: false,       // gratuit — nu se vinde bilet pe portal
    pret_bilet: null,
    capacitate: null,    // o completează Alex per sală
    curs: null,          // NU e eveniment de grupă (n-are ce căuta în calendarul membrilor)
  }
  const hit = byKey.get(key(s.data, s.ora, s.loc))
  if (hit) {
    update++
    console.log(`  ~ ${s.data} ${s.ora} ${s.loc} → ${row.nume_eveniment}`)
    if (APPLY) {
      const { error } = await db.from('evenimente').update(row).eq('id', hit.id)
      if (error) { console.error(error); process.exit(1) }
    }
  } else {
    create++
    console.log(`  + ${s.data} ${s.ora} ${s.loc} → ${row.nume_eveniment}`)
    if (APPLY) {
      const { error } = await db.from('evenimente').insert(row)
      if (error) { console.error(error); process.exit(1) }
    }
  }
}

console.log(`\n${APPLY ? 'Aplicat' : 'Dry-run'}: ${create} de creat, ${update} de actualizat.`)
if (!APPLY) console.log('(rulează cu --apply)')
