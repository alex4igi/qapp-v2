// Dry-run pentru pasul 1 din cron-morning (reminderul din ziua ședinței).
// Compară selecția VECHE (leads.status='programat' + leads.data_programare) cu
// cea NOUĂ (programările zilei din programari_leads). Nu trimite nimic și nu
// scrie nicăieri.
//
// Rulare:  node scripts/dry-run-reminder-sms.mjs [YYYY-MM-DD]

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
const startOfDay = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x.toISOString() }
const endOfDay = (d) => { const x = new Date(d); x.setUTCHours(23, 59, 59, 999); return x.toISOString() }

const dow = now.getUTCDay()
const targets = []
if (dow >= 1 && dow <= 5) targets.push({ day: new Date(now), cand: 'azi' })
const tomorrow = new Date(now.getTime() + 86_400_000)
if ([6, 0].includes(tomorrow.getUTCDay())) targets.push({ day: tomorrow, cand: 'maine' })

console.log(`Rulare simulată: ${localDate(now)} 10:00 — ținte: ${targets.map((t) => `${localDate(t.day)} (${t.cand})`).join(', ') || 'niciuna'}\n`)

for (const t of targets) {
  const ziIso = localDate(t.day)

  const { data: programari } = await svc
    .from('programari_leads')
    .select('lead, ora, locatie, eveniment_programat, cursul_programat')
    .eq('prezenta', 'programat')
    .eq('data_programarii', ziIso)
    .not('lead', 'is', null)

  const sloturi = new Map()
  for (const p of programari ?? []) {
    if (sloturi.has(p.lead)) continue
    sloturi.set(p.lead, p)
  }

  const { data: fromLeads } = await svc
    .from('leads')
    .select('id')
    .eq('status', 'programat')
    .gte('data_programare', startOfDay(t.day))
    .lte('data_programare', endOfDay(t.day))
  const vechi = new Set((fromLeads ?? []).map((l) => l.id))
  for (const id of vechi) if (!sloturi.has(id)) sloturi.set(id, null)

  const ids = [...sloturi.keys()]
  const { data: leads } = ids.length
    ? await svc.from('leads').select('id, nume, prenume, telefon, status, deja_client, locatia').in('id', ids)
    : { data: [] }

  const evIds = [...new Set([...sloturi.values()].map((s) => s?.eveniment_programat).filter(Boolean))]
  const { data: evenimente } = evIds.length
    ? await svc.from('evenimente').select('id, nume_eveniment, tip, ora, locatie_id, status').in('id', evIds)
    : { data: [] }
  const evById = new Map((evenimente ?? []).map((e) => [e.id, e]))

  const locIds = [...new Set([
    ...[...sloturi.values()].map((s) => s?.locatie),
    ...(evenimente ?? []).map((e) => e.locatie_id),
  ].filter(Boolean))]
  const { data: locatii } = locIds.length
    ? await svc.from('locatii').select('id, nume').in('id', locIds)
    : { data: [] }
  const numeLocatie = new Map((locatii ?? []).map((l) => [l.id, l.nume]))

  console.log(`── ${ziIso} (${t.cand}) ─────────────────────────────`)
  console.log(`programări în ziua asta: ${sloturi.size - [...sloturi.values()].filter((s) => s === null).length} · leaduri „Programat" cu data (vechea sursă): ${vechi.size}\n`)

  let castigati = 0, pierduti = 0, comuni = 0
  for (const lead of leads ?? []) {
    const slot = sloturi.get(lead.id)
    const ev = slot?.eveniment_programat ? evById.get(slot.eveniment_programat) : null
    const eraVechi = vechi.has(lead.id)
    const eNou = Boolean(lead.telefon) && !(ev?.status === 'Anulat')
    const cine = `${lead.prenume ?? ''} ${lead.nume}`.trim()
    const unde = ev ? `DEMO „${ev.nume_eveniment}" (${ev.tip}) ${ev.ora ?? '—'}` : slot?.cursul_programat ? `curs ${slot.ora ?? '—'}` : 'fără programare'
    const oraFinal = ev?.ora ?? slot?.ora ?? null
    const locFinal = numeLocatie.get(ev?.locatie_id ?? slot?.locatie) ?? lead.locatia ?? '(fallback Ștefan)'
    if (!eraVechi && eNou) { castigati++; console.log(`  + CÂȘTIGAT  ${cine} [${lead.status}] → ${unde}\n              ora „${oraFinal}" · locatie „${locFinal}"`) }
    else if (eraVechi && !eNou) { pierduti++; console.log(`  - PIERDUT   ${cine} [${lead.status}] → ${unde} (fără telefon: ${!lead.telefon}, ev anulat: ${ev?.status === 'Anulat'})`) }
    else if (eNou) { comuni++ }
  }
  console.log(`\n  = ${comuni} la fel · + ${castigati} în plus · − ${pierduti} în minus\n`)
}
