// Test e2e (DB) pentru pragul de capacitate al unei clase demo:
//   - a N-a inscriere umple clasa  → notificare `demo_class_full` (TODO) la manageri
//   - inscrierea peste plin        → refuzata, cu mesaj clar
//   - overbook explicit            → trece
//   - umplerea nu re-notifica      → o singura alarma per eveniment
//
// Ruleaza pe Supabase de PRODUCTIE — fixture marcat „ZZTEST", curatat la final.
//
//   node scripts/test-demo-capacitate.mjs
//   node scripts/test-demo-capacitate.mjs cleanup

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

const TAG = 'ZZTEST capacitate demo'
let fail = 0
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fail++ }

async function cleanup() {
  const { data: evs } = await db.from('evenimente').select('id').eq('nume_eveniment', TAG)
  for (const ev of evs ?? []) {
    await db.from('programari_leads').delete().eq('eveniment_programat', ev.id)
    await db.from('evenimente_participanti').delete().eq('eveniment', ev.id)
    await db.from('notifications').delete().eq('kind', 'demo_class_full')
      .filter('payload->>eveniment_id', 'eq', ev.id)
    await db.from('evenimente').delete().eq('id', ev.id)
  }
  await db.from('leads').delete().like('nume', 'ZZTEST-CAP%')
  console.log('🧹 fixture sters')
}

if (process.argv[2] === 'cleanup') { await cleanup(); process.exit(0) }

await cleanup()

// Ziua de maine, ca sa nu cada peste crounuri care ating evenimentele trecute.
const data = new Date(Date.now() + 864e5).toISOString().slice(0, 10)
const { data: ev, error: evErr } = await db.from('evenimente').insert({
  nume_eveniment: TAG, tip: 'DEMO Class', data, ora: '18:00',
  locatia: 'Nicolina', status: 'Urmator', capacitate: 2, public: false,
}).select('id').single()
if (evErr) { console.error(evErr); process.exit(1) }

const leads = []
for (const n of [1, 2, 3]) {
  const { data: l, error } = await db.from('leads').insert({
    nume: `ZZTEST-CAP${n}`, prenume: 'Test', telefon: `07999000${n}0`, status: 'nou',
  }).select('id').single()
  if (error) { console.error(error); process.exit(1) }
  leads.push(l.id)
}

const notifCount = async () => {
  const { count } = await db.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'demo_class_full')
    .filter('payload->>eveniment_id', 'eq', ev.id)
  return count ?? 0
}
const inscrie = (lead, overbook = false) =>
  db.rpc('inscrie_la_demo', {
    p_eveniment: ev.id, p_lead: lead, p_sursa: 'receptie', p_permite_overbook: overbook,
  })

// 1/2 — sub prag, fara alarma.
const r1 = await inscrie(leads[0])
ok(!r1.error, `prima inscriere trece (${r1.error?.message ?? 'ok'})`)
ok((await notifCount()) === 0, 'la 1/2 nu se notifica nimeni')

// 2/2 — pragul e atins.
const r2 = await inscrie(leads[1])
ok(!r2.error, `a doua inscriere trece (${r2.error?.message ?? 'ok'})`)
const dupaPrag = await notifCount()
ok(dupaPrag > 0, `la 2/2 pleaca alarma catre manageri (${dupaPrag} notificari)`)

const { data: notif } = await db.from('notifications').select('title, body, requires_action, status')
  .eq('kind', 'demo_class_full').filter('payload->>eveniment_id', 'eq', ev.id).limit(1).single()
ok(notif?.requires_action === true && notif?.status === 'open', 'alarma e TODO deschis, nu simpla informare')
console.log(`   „${notif?.title}" — ${notif?.body}`)

// 3/2 — refuzata.
const r3 = await inscrie(leads[2])
ok(/completa/i.test(r3.error?.message ?? ''), `a treia e refuzata: ${r3.error?.message ?? '(a trecut!)'}`)

// 3/2 cu overbook — trece.
const r4 = await inscrie(leads[2], true)
ok(!r4.error, `overbook explicit trece (${r4.error?.message ?? 'ok'})`)
ok((await notifCount()) === dupaPrag, 'umplerea nu re-notifica (o alarma per eveniment)')

const { data: ocupat } = await db.rpc('locuri_ocupate_eveniment', { p_eveniment: ev.id })
ok(ocupat === 3, `ocuparea finala e 3/2 (${ocupat})`)

await cleanup()
console.log(fail === 0 ? '\n🎉 toate verificarile au trecut' : `\n💥 ${fail} verificari picate`)
process.exit(fail === 0 ? 0 : 1)
