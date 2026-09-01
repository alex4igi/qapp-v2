// Fix punctual (01-09-2026): 7 incasari din 27.08.2026 au fost inregistrate ca
// „Taxa" desi erau taxe de auditie. Le mutam pe evenimentul „Auditie Q Motion -
// sept. 2026": categorie -> 'Auditie' + bilet -> id-ul evenimentului (coloana
// `incasari.bilet` e legatura incasare→eveniment). Cei 2 platitori care nu erau
// inca in roster se inscriu explicit, ca sa aiba prezenta ca ceilalti 5.
//
// Idempotent: rerularea nu schimba nimic. Dry-run implicit.
//
//   node scripts/fix-taxe-auditie-qmotion.mjs           # doar raporteaza
//   node scripts/fix-taxe-auditie-qmotion.mjs --apply   # scrie

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

const EVENIMENT = 'a53bb6ec-a21a-448f-9bb3-bfbc59ef9852' // Auditie Q Motion - sept. 2026
const DATA = '2026-08-27'
const MOTIV = 'Taxe inregistrate gresit ca „Taxa"; erau taxe de auditie Q Motion (5 sept. 2026).'
const APPLY = process.argv.includes('--apply')

const { data: ev, error: evErr } = await db.from('evenimente')
  .select('id, nume_eveniment, tip, data, ora, pret_bilet, participant')
  .eq('id', EVENIMENT).single()
if (evErr) throw evErr
if (ev.tip !== 'Auditie') throw new Error('Evenimentul tinta nu e de tip Auditie.')
console.log(`Eveniment tinta: ${ev.nume_eveniment} (${ev.data} ${ev.ora}), pret_bilet=${ev.pret_bilet}`)

// Rândurile vizate: taxele de 60 lei din 27.08 cu observatia „Auditie", inca nelegate.
const { data: rows, error: rErr } = await db.from('incasari')
  .select('id, data, suma, metoda, categorie, bilet, client, observatii, locatie, clienti(nume, prenume)')
  .eq('data', DATA).ilike('observatii', 'auditie')
  .in('categorie', ['Taxa', 'Auditie'])
if (rErr) throw rErr

const deMutat = rows.filter((r) => r.categorie !== 'Auditie' || r.bilet !== EVENIMENT)
console.log(`\nIncasari gasite: ${rows.length} · de mutat: ${deMutat.length}`)
for (const r of rows) {
  const nume = `${r.clienti?.nume ?? ''} ${r.clienti?.prenume ?? ''}`.trim() || '(fara client)'
  const stare = r.categorie === 'Auditie' && r.bilet === EVENIMENT ? 'deja mutata' : 'DE MUTAT'
  console.log(`  ${nume.padEnd(26)} ${String(r.suma).padStart(4)} lei ${String(r.metoda).padEnd(6)} → ${stare}`)
}
if (!deMutat.length) console.log('  nimic de facut pe incasari.')

if (!APPLY) {
  console.log('\n(dry-run — ruleaza cu --apply ca sa scrie)')
  process.exit(0)
}

for (const r of deMutat) {
  const { error } = await db.from('incasari')
    .update({ categorie: 'Auditie', bilet: EVENIMENT, updated: new Date().toISOString() })
    .eq('id', r.id)
  if (error) throw error
  const { error: aErr } = await db.from('audit_log').insert({
    actor_role: 'script',
    action: 'incasare_modified',
    entity_type: 'incasare',
    entity_id: r.id,
    old_value: { categorie: r.categorie, bilet: r.bilet },
    new_value: { categorie: 'Auditie', bilet: EVENIMENT, eveniment: ev.nume_eveniment },
    reason: MOTIV,
    locatie_id: r.locatie,
  })
  if (aErr) throw aErr
}
console.log(`\n✅ ${deMutat.length} incasari mutate pe „${ev.nume_eveniment}" (+ audit_log).`)

// Inscriere explicita in roster (dual-write ca add_eveniment_participant):
// tabelul poarta prezenta, array-ul ramane sincronizat.
const clienti = [...new Set(rows.map((r) => r.client).filter(Boolean))]
const { data: existing, error: pErr } = await db.from('evenimente_participanti')
  .select('client').eq('eveniment', EVENIMENT)
if (pErr) throw pErr
const auDeja = new Set((existing ?? []).map((p) => p.client))
const deAdaugat = clienti.filter((c) => !auDeja.has(c))

if (deAdaugat.length) {
  const { error } = await db.from('evenimente_participanti')
    .insert(deAdaugat.map((c) => ({ eveniment: EVENIMENT, client: c, sursa_inscriere: 'receptie' })))
  if (error) throw error
  const merged = [...new Set([...(ev.participant ?? []), ...clienti])]
  const { error: uErr } = await db.from('evenimente')
    .update({ participant: merged, updated: new Date().toISOString() }).eq('id', EVENIMENT)
  if (uErr) throw uErr
}
console.log(`✅ inscrisi in roster: ${deAdaugat.length} (ceilalti erau deja).`)
