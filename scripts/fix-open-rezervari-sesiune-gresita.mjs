// One-shot: recepția a înregistrat înrolările „Per ședință" la OPEN class în ziua
// încasării, nu la data ședinței — banii erau luați în avans pentru următorul OPEN.
// Mută rezervările vii de pe sesiunile-fantomă din ultimele 7 zile pe sesiunea OPEN
// de azi și redatează înrolarea. Încasările NU se ating (data cash-ului e reală).
//
//   node scripts/fix-open-rezervari-sesiune-gresita.mjs         # dry-run
//   node scripts/fix-open-rezervari-sesiune-gresita.mjs --apply # aplică

import { readFileSync, writeFileSync } from 'node:fs'
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
const CURS = process.env.CURS ?? 'f1f13f66-0d2d-4c26-aed4-37783e6c2982' // S Open Class, sezon activ
const now = new Date()
const TARGET = process.env.TARGET_DATA ?? new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
const FROM = new Date(new Date(TARGET).getTime() - 7 * 86_400_000).toISOString().slice(0, 10)

const { data: curs } = await db.from('cursuri').select('id, numele, facultativ, zile, capacitate_maxima').eq('id', CURS).single()
console.log(`Curs: ${curs.numele} (facultativ=${curs.facultativ}, zile=${curs.zile}, cap=${curs.capacitate_maxima})`)
console.log(`Sesiune țintă: ${TARGET} · surse: sesiuni din [${FROM}, ${TARGET})\n`)

const { data: sesiuni } = await db.from('open_sesiuni')
  .select('id, data, capacitate, status').eq('curs', CURS).gte('data', FROM).lte('data', TARGET).order('data')
const target = (sesiuni ?? []).find((s) => s.data === TARGET)
if (!target) { console.error(`Nu există sesiune OPEN pe ${TARGET}. Stop.`); process.exit(1) }
const surse = (sesiuni ?? []).filter((s) => s.data !== TARGET)

const { data: rez } = await db.from('open_rezervari')
  .select('id, sesiune, client, enrollment, status, suma, clienti:client(nume, prenume)')
  .in('sesiune', (sesiuni ?? []).map((s) => s.id)).neq('status', 'anulat')

const byId = Object.fromEntries((sesiuni ?? []).map((s) => [s.id, s.data]))
const peTinta = (rez ?? []).filter((r) => r.sesiune === target.id)
const deMutat = (rez ?? []).filter((r) => r.sesiune !== target.id)

if (!deMutat.length) { console.log('Nimic de mutat.'); process.exit(0) }

// gardă 1: clientul nu poate avea două rezervări vii pe aceeași sesiune (uq_open_rez_client_active)
const dejaPeTinta = new Set(peTinta.map((r) => r.client))
const conflicte = deMutat.filter((r) => dejaPeTinta.has(r.client))
if (conflicte.length) {
  console.error('CONFLICT: clienți care au deja rezervare pe sesiunea țintă:')
  for (const c of conflicte) console.error(`  ${c.clienti?.nume} ${c.clienti?.prenume ?? ''} (rez ${c.id})`)
  process.exit(1)
}
// gardă 2: capacitatea sesiunii țintă
const total = peTinta.length + deMutat.length
if (total > target.capacitate) {
  console.error(`CONFLICT: ${total} rezervări > capacitate ${target.capacitate}. Stop.`)
  process.exit(1)
}

console.log(`Pe ${TARGET} sunt deja ${peTinta.length}. De mutat: ${deMutat.length} → total ${total}/${target.capacitate}\n`)
for (const r of deMutat) {
  console.log(`  ${byId[r.sesiune]} → ${TARGET} | ${r.clienti?.nume} ${r.clienti?.prenume ?? ''} | ${r.suma} lei | rez=${r.id}`)
}
console.log(`\nSesiuni-fantomă rămase goale: ${surse.map((s) => s.data).join(', ')} (NU se șterg aici)`)

if (!APPLY) { console.log('\n(dry-run — rulează cu --apply)'); process.exit(0) }

const enrIds = deMutat.map((r) => r.enrollment).filter(Boolean)
const { data: enrBefore } = await db.from('enrollments').select('*').in('id', enrIds)
const backup = { at: new Date().toISOString(), curs: CURS, target: TARGET, rezervari: deMutat, enrollments: enrBefore, sesiuni_sursa: surse }
const bpath = new URL(`./cleanup/_backup_open_sesiune_${TARGET.replaceAll('-', '')}.json`, import.meta.url)
writeFileSync(bpath, JSON.stringify(backup, null, 2))
console.log(`\nBackup: ${bpath.pathname}`)

const { error: e1 } = await db.from('open_rezervari').update({ sesiune: target.id }).in('id', deMutat.map((r) => r.id))
if (e1) { console.error('EȘEC update open_rezervari:', e1); process.exit(1) }
const { error: e2 } = await db.from('enrollments').update({ data_incepere: TARGET }).in('id', enrIds)
if (e2) { console.error('EȘEC update enrollments:', e2); process.exit(1) }

const { count } = await db.from('open_rezervari').select('id', { count: 'exact', head: true }).eq('sesiune', target.id).neq('status', 'anulat')
console.log(`\n✅ Mutate ${deMutat.length} rezervări + ${enrIds.length} înrolări. Sesiunea ${TARGET}: ${count}/${target.capacitate}`)
