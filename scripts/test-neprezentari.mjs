// Test e2e (DB) pentru contorul de neprezentări + rutarea a-2-a-neprezentare→nurture.
// Rulează pe Supabase de PRODUCȚIE — fixture marcat „ZZTEST", curățat la final.
//
//   node scripts/test-neprezentari.mjs a       # scenariul 1-a neprezentare → nu_a_venit
//   node scripts/test-neprezentari.mjs b       # reprogramare + a 2-a → nurture
//   node scripts/test-neprezentari.mjs cleanup # șterge fixture-ul
//
// prune_expired_leads() e apelat oricum la fiecare /leads; e idempotent și sigur.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const TEL = '0700000199'
const NUME = 'ZZTEST Neprezentari'

const ok = (c, m) => console.log(`${c ? '✅' : '❌ FAIL'} ${m}`)

async function getLead() {
  const { data } = await svc.from('leads').select('*').eq('telefon', TEL).maybeSingle()
  return data
}

async function cleanup() {
  const lead = await getLead()
  if (!lead) { console.log('nimic de curățat'); return }
  await svc.from('programari_leads').delete().eq('lead', lead.id)
  await svc.from('sms_logs').delete().eq('lead_id', lead.id)
  await svc.from('leads').delete().eq('id', lead.id)
  console.log('🧹 fixture șters')
}

async function phaseA() {
  await cleanup()
  const { data: lead, error } = await svc.from('leads')
    .insert({ nume: NUME, telefon: TEL, status: 'programat' })
    .select('*').single()
  if (error) throw error
  // Programare 1, în trecut, încă „programat" (neatinsă de recepție).
  await svc.from('programari_leads').insert({
    lead: lead.id, prezenta: 'programat', data_programarii: '2026-06-01',
  })
  // prune: marchează absent + rutează. 1 absență → nu_a_venit.
  await svc.rpc('prune_expired_leads')
  const after = await getLead()
  ok(after.nr_neprezentari === 1, `nr_neprezentari = ${after.nr_neprezentari} (aștept 1)`)
  ok(after.status === 'nu_a_venit', `status = ${after.status} (aștept nu_a_venit)`)
  console.log(`\n👉 lead-ul e în „Nu a venit" cu badge ❌ 1 — verifică în /leads. id=${after.id}`)
}

async function phaseB() {
  const lead = await getLead()
  if (!lead) throw new Error('rulează întâi faza „a"')
  // Reprogramare: revine în „programat" + programare 2 în trecut, neatinsă.
  await svc.from('leads').update({ status: 'programat' }).eq('id', lead.id)
  await svc.from('programari_leads').insert({
    lead: lead.id, prezenta: 'programat', data_programarii: '2026-06-15',
  })
  await svc.rpc('prune_expired_leads')
  const after = await getLead()
  ok(after.nr_neprezentari === 2, `nr_neprezentari = ${after.nr_neprezentari} (aștept 2)`)
  ok(after.status === 'nurture', `status = ${after.status} (aștept nurture — fără SMS)`)
  // Confirmă că nu s-a logat niciun followup pentru lead.
  const { count } = await svc.from('sms_logs')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead.id).eq('tip', 'followup')
  ok((count ?? 0) === 0, `sms_logs followup = ${count ?? 0} (aștept 0)`)
}

const cmd = process.argv[2]
if (cmd === 'a') await phaseA()
else if (cmd === 'b') await phaseB()
else if (cmd === 'cleanup') await cleanup()
else console.log('folosește: a | b | cleanup')
