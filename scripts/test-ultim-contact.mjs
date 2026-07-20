// Test e2e (DB) pentru fixul `leads.ultima_contactare_la`.
// Rulează pe Supabase de PRODUCȚIE — fixture marcat „ZZTEST", curățat la final.
//
//   node scripts/test-ultim-contact.mjs
//
// Regresia acoperită: înainte de migrația 20260722100000, un contact cu
// rezultat 'reusit' NU actualiza ultima_contactare_la (updateLead bumpa doar la
// trecerea sub_status → nu_raspunde/de_revenit), deci leadurile cu care se
// vorbise apăreau „Niciodată contactat" în vederea Listă.

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

const NUME = 'ZZTEST UltimContact'
const ok = (c, m) => { console.log(`${c ? '✅' : '❌ FAIL'} ${m}`); if (!c) process.exitCode = 1 }

async function cleanup(leadId) {
  if (leadId) await svc.from('lead_contacte').delete().eq('lead_id', leadId)
  await svc.from('leads').delete().eq('nume', NUME)
}

await cleanup(null)

const { data: lead, error: insErr } = await svc
  .from('leads')
  .insert({ nume: NUME, status: 'contactat', telefon: '+40700000198' })
  .select('*')
  .single()
if (insErr) throw insErr

try {
  ok(lead.ultima_contactare_la === null, 'lead nou → ultima_contactare_la null')

  // user_id e NOT NULL; cu service role auth.uid() e null, deci îl furnizăm.
  const { data: someUser } = await svc
    .from('lead_contacte').select('user_id').limit(1).maybeSingle()
  const userId = someUser?.user_id
  if (!userId) throw new Error('nu există niciun lead_contacte din care să iau un user_id')

  // Cazul care era rupt: contact REUȘIT.
  const { error: cErr } = await svc.from('lead_contacte').insert({
    lead_id: lead.id, user_id: userId, canal: 'telefon', rezultat: 'reusit',
    observatii: 'ZZTEST',
  })
  if (cErr) throw cErr

  const { data: dupa } = await svc
    .from('leads').select('ultima_contactare_la, updated').eq('id', lead.id).single()

  ok(dupa.ultima_contactare_la !== null,
     'contact „reusit" → ultima_contactare_la setat (regresia principală)')

  const varsta = Date.now() - new Date(dupa.ultima_contactare_la).getTime()
  ok(varsta >= 0 && varsta < 60_000, `timestampul e proaspăt (${Math.round(varsta / 1000)}s)`)

  // Un contact mai vechi nu trebuie să dea înapoi valoarea (GREATEST).
  const vechi = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString()
  await svc.from('lead_contacte').insert({
    lead_id: lead.id, user_id: userId, canal: 'sms', rezultat: 'follow_up',
    created: vechi, observatii: 'ZZTEST vechi',
  })
  const { data: dupa2 } = await svc
    .from('leads').select('ultima_contactare_la').eq('id', lead.id).single()
  ok(dupa2.ultima_contactare_la === dupa.ultima_contactare_la,
     'un contact mai vechi nu dă înapoi ultima_contactare_la')
} finally {
  await cleanup(lead.id)
  const { count } = await svc
    .from('leads').select('id', { count: 'exact', head: true }).eq('nume', NUME)
  ok((count ?? 0) === 0, 'fixture curățat')
}
