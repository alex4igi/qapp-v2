// Șterge clienții de test ZZTEST (creați 2026-07-21 la testarea worklist-ului de
// recuperare) cu tot cu datele lor asociate. DRY-RUN implicit; `--apply` execută.
//
// De ce script și nu DELETE simplu: FK-urile spre clienti(id) sunt majoritar
// `on delete set null` — un delete naiv ar lăsa înrolări/încasări/prezențe orfane
// (client=null) care poluează statisticile. Copiii se șterg explicit, în ordine.
import fs from 'node:fs'
import { sb } from '../migrate/lib.mjs'

const APPLY = process.argv.includes('--apply')

// id → numele așteptat (gardă: abort dacă DB-ul nu se potrivește)
const TARGETS = {
  '44170591-749a-41d0-a4c4-12f349df85fe': 'ZZTEST Ana',
  '143db4cc-ff5a-44cd-bea8-b3f4334d246c': 'ZZTEST Mihai',
  'ce4976a4-cb49-4153-9990-f2123f70a309': 'ZZTEST Adult',
}
const ids = Object.keys(TARGETS)

// tabele copil pe client, în ordinea de ștergere (după cele dependente de enrollments)
const CLIENT_FKS = [
  ['netopia_orders', 'client_id'],
  ['client_contacte', 'client_id'],
  ['evaluari', 'client'],
  ['documente_client', 'client'],
  ['anunturi_clienti', 'client_id'],
  ['email_logs', 'client_id'],
  ['feedback', 'autor'],
  ['vouchere', 'client'],
  ['bilete', 'client'],
  ['inchirieri', 'client'],
  ['contracte', 'client_id'],
  ['spectacol_act_performeri', 'client'],
  ['datorii', 'client'],
  ['leads', 'id_client'],
]
// tabele copil pe enrollment (se șterg înaintea enrollments)
const ENROLLMENT_FKS = [
  ['confirmari_inrolare_sms', 'enrollment_id'],
  ['motivari_absenta', 'enrollment'],
]

// === Gărzi ===
const { data: clients, error: eCl } = await sb.from('clienti').select('*').in('id', ids)
if (eCl) throw eCl
if (clients.length !== ids.length) {
  console.log(`Găsiți doar ${clients.length}/${ids.length} clienți — probabil deja șterși. Abort.`)
  process.exit(1)
}
for (const c of clients) {
  if (!c.nume?.startsWith('ZZTEST')) {
    console.error(`ABORT: clientul ${c.id} se numește "${c.nume} ${c.prenume}", nu ZZTEST.`)
    process.exit(1)
  }
  // fixture-urile din seed-portal-test.mjs pot avea auth_user_id (login portal de
  // test) — seedul re-leagă contul la re-rulare, deci doar semnalăm, nu blocăm
  if (c.auth_user_id) {
    const { data: u } = await sb.auth.admin.getUserById(c.auth_user_id)
    console.log(`ℹ ${c.nume} ${c.prenume}: auth_user_id ${u?.user ? `activ (${u.user.email})` : 'orfan (user șters)'} — clientul se șterge, contul rămâne.`)
  }
}
// facturi reale ar fi grave — abort; netopia_orders de test se șterg mai jos
{
  const { count } = await sb.from('facturi_fgo').select('*', { count: 'exact', head: true }).in('client_id', ids)
  if (count > 0) {
    console.error(`ABORT: ${count} rânduri în facturi_fgo (FK NO ACTION) — decizie manuală necesară.`)
    process.exit(1)
  }
}

// === Inventar ===
const { data: enrs } = await sb.from('enrollments').select('id').in('client', ids)
const enrIds = (enrs ?? []).map((e) => e.id)

const inventory = []
const countRows = async (table, col, list) => {
  if (list.length === 0) return 0
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true }).in(col, list)
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}
// încasări/prezențe/open_rezervari/voucher_redemptions/reinscrieri_gate au FK și pe
// client și pe enrollment — le numărăm/ștergem pe ambele coloane
const DUAL = [
  ['incasari', 'client', 'inregistrare'],
  ['prezente', 'client', 'enrollment'],
  ['open_rezervari', 'client', 'enrollment'],
  ['voucher_redemptions', 'client', 'enrollment'],
  ['reinscrieri_gate', 'client_id', 'enrollment_id'],
]
for (const [table, colClient, colEnr] of DUAL) {
  const n = (await countRows(table, colClient, ids)) + (await countRows(table, colEnr, enrIds))
  if (n) inventory.push([table, n])
}
for (const [table, col] of ENROLLMENT_FKS) {
  const n = await countRows(table, col, enrIds)
  if (n) inventory.push([table, n])
}
if (enrIds.length) inventory.push(['enrollments', enrIds.length])
for (const [table, col] of CLIENT_FKS) {
  const n = await countRows(table, col, ids)
  if (n) inventory.push([table, n])
}
// referințe în situatie_sms_uri.clienti_vizati (uuid[], fără FK)
let smsRows = []
for (const id of ids) {
  const { data } = await sb.from('situatie_sms_uri').select('id, clienti_vizati').contains('clienti_vizati', [id])
  for (const row of data ?? []) if (!smsRows.some((r) => r.id === row.id)) smsRows.push(row)
}
if (smsRows.length) inventory.push(['situatie_sms_uri (curățare array)', smsRows.length])

console.log(`=== ${APPLY ? 'APPLY' : 'DRY-RUN'} — ștergere clienți de test ===`)
for (const c of clients) console.log(`  ${c.id.slice(0, 8)}  ${c.nume} ${c.prenume} [${c.status}] familia:${c.familia?.slice(0, 8) ?? '—'}`)
console.log(`Înrolări: ${enrIds.length}`)
console.log('Date asociate de șters:')
for (const [t, n] of inventory) console.log(`  ${t}: ${n}`)

if (!APPLY) {
  console.log('\nDRY-RUN — nimic modificat. Rulează cu --apply pentru execuție.')
  process.exit(0)
}

// === APPLY ===
const bakPath = `scripts/cleanup/_deleted_test_clients_backup_20260724.json`
fs.writeFileSync(bakPath, JSON.stringify({ clients, enrollments: enrs }, null, 2))
console.log(`\nBackup → ${bakPath}`)

const del = async (table, col, list) => {
  if (list.length === 0) return
  const { error } = await sb.from(table).delete().in(col, list)
  if (error) throw new Error(`${table}.${col}: ${error.message}`)
}
for (const [table, colClient, colEnr] of DUAL) {
  await del(table, colClient, ids)
  await del(table, colEnr, enrIds)
}
for (const [table, col] of ENROLLMENT_FKS) await del(table, col, enrIds)
await del('enrollments', 'id', enrIds)
for (const [table, col] of CLIENT_FKS) await del(table, col, ids)

for (const row of smsRows) {
  const filtered = (row.clienti_vizati ?? []).filter((id) => !ids.includes(id))
  const { error } = await sb.from('situatie_sms_uri').update({ clienti_vizati: filtered }).eq('id', row.id)
  if (error) throw new Error(`situatie_sms_uri ${row.id}: ${error.message}`)
}

await del('clienti', 'id', ids)
console.log(`Șterși ${ids.length} clienți + datele asociate.`)

// familii orfane rămase fără membri (doar dacă nu apar în facturi și nu sunt
// login de portal — familia „ZZTEST Portal" are auth_user_id și e refolosită de
// seed-portal-test.mjs, deci rămâne)
const famIds = [...new Set(clients.map((c) => c.familia).filter(Boolean))]
for (const famId of famIds) {
  const { data: fam } = await sb.from('familii').select('id, nume_familie, auth_user_id').eq('id', famId).single()
  if (fam?.auth_user_id) {
    console.log(`Familia „${fam.nume_familie}" păstrată (are login de portal).`)
    continue
  }
  const { count: members } = await sb.from('clienti').select('*', { count: 'exact', head: true }).eq('familia', famId)
  const { count: facturi } = await sb.from('facturi_fgo').select('*', { count: 'exact', head: true }).eq('familia_id', famId)
  if (members === 0 && facturi === 0) {
    const { error } = await sb.from('familii').delete().eq('id', famId)
    if (error) console.log(`Familia ${famId.slice(0, 8)} NU s-a putut șterge: ${error.message}`)
    else console.log(`Familia orfană ${famId.slice(0, 8)} ștearsă.`)
  } else {
    console.log(`Familia ${famId.slice(0, 8)} păstrată (membri: ${members}, facturi: ${facturi}).`)
  }
}
console.log('Gata.')
