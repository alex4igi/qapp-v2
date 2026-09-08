// Dry-run pentru pasul 5 din cron-morning (SMS la 2 zile după demo).
// Replică EXACT selecția din edge function, dar nu trimite nimic și nu scrie în
// sms_logs — doar raportează cine ar primi mesajul azi și cine e exclus, cu motiv.
//
// Rulare:  node scripts/dry-run-post-demo-sms.mjs [YYYY-MM-DD]
// Argumentul opțional simulează o altă zi de rulare (pentru verificarea regulii
// de duminică / a recuperării de luni).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const now = process.argv[2] ? new Date(`${process.argv[2]}T10:00:00+03:00`) : new Date()
const localDate = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const weekday = (d) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', weekday: 'short' }).format(d)
const zi = (n) => localDate(new Date(now.getTime() - n * 86_400_000))

console.log(`Rulare simulată: ${localDate(now)} (${weekday(now)}) 10:00\n`)
if (weekday(now) === 'Sun') {
  console.log('Duminică → pasul se sare cu totul. Mesajele cad luni.')
  process.exit(0)
}

const fereastra = `${zi(4)} .. ${zi(2)}`
const { data: prezente } = await svc
  .from('programari_leads')
  .select('lead, data_programarii')
  .eq('prezenta', 'prezent')
  .gte('data_programarii', zi(4))
  .lte('data_programarii', zi(2))
  .not('lead', 'is', null)

const leadIds = [...new Set((prezente ?? []).map((p) => p.lead))]
console.log(`Fereastra de demo-uri: ${fereastra}`)
console.log(`Prezențe în fereastră: ${prezente?.length ?? 0} → ${leadIds.length} leaduri distincte\n`)
if (!leadIds.length) process.exit(0)

const { data: toate } = await svc
  .from('leads')
  .select('id, prenume, nume, telefon, status, deja_client, id_client')
  .in('id', leadIds)

const candidati = (toate ?? []).filter((l) => l.status === 'a_venit' && !l.deja_client)
const respinsiStatus = (toate ?? []).filter((l) => l.status !== 'a_venit' || l.deja_client)

// leaduriProtejate: lead legat de un client care NU e EXclient.
const clientIds = [...new Set(candidati.map((l) => l.id_client).filter(Boolean))]
const activi = new Set()
if (clientIds.length) {
  const { data } = await svc.from('clienti').select('id').in('id', clientIds).neq('status', 'EXclient')
  for (const c of data ?? []) activi.add(c.id)
}
const { data: cuViitor } = await svc
  .from('programari_leads')
  .select('lead')
  .in('lead', candidati.map((l) => l.id))
  .gte('data_programarii', localDate(now))
const auViitor = new Set((cuViitor ?? []).map((p) => p.lead))
const { data: deja } = await svc
  .from('sms_logs')
  .select('lead_id')
  .eq('tip', 'post_demo')
  .eq('status', 'sent')
  .in('lead_id', candidati.map((l) => l.id))
const auPrimit = new Set((deja ?? []).map((r) => r.lead_id))

const trimite = []
const sare = []
for (const l of candidati) {
  const nume = `${l.prenume ?? ''} ${l.nume ?? ''}`.trim()
  if (!l.telefon) sare.push([nume, 'fără telefon'])
  else if (activi.has(l.id_client)) sare.push([nume, 'client activ (conversie neînregistrată)'])
  else if (auViitor.has(l.id)) sare.push([nume, 'are deja altă programare'])
  else if (auPrimit.has(l.id)) sare.push([nume, 'a primit deja post_demo'])
  else trimite.push(nume)
}

console.log(`✅ AR PRIMI SMS: ${trimite.length}`)
for (const n of trimite) console.log(`   - ${n}`)
console.log(`\n⏭️  Sărite dintre candidați (${sare.length}):`)
for (const [n, motiv] of sare) console.log(`   - ${n}: ${motiv}`)
console.log(`\n⏭️  Prezenți în fereastră dar nu în 'a_venit' (${respinsiStatus.length}):`)
const pe = {}
for (const l of respinsiStatus) {
  const k = l.deja_client ? 'deja_client' : l.status
  pe[k] = (pe[k] ?? 0) + 1
}
for (const [k, v] of Object.entries(pe)) console.log(`   - ${k}: ${v}`)
