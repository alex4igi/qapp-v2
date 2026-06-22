// EXECUȚIE (aprobat user 2026-06-22):
//  1. șterge toate lead-urile importate din v1 (id determinist)
//  2. restaurează cei 4 lead-uri REALE de pe site, șterse de re-importul de azi
import fs from 'node:fs'
import { sb, uuid, load } from './lib.mjs'

const v1 = load('Leads')
const importedIds = [...new Set(v1.map((l) => uuid('Leads', l.id)))]
console.log(`Lead-uri v1 de șters: ${importedIds.length}`)

// --- 1. delete în batch-uri (cascade curăță programari_leads/lead_history/lead_contacte) ---
let deleted = 0
for (let i = 0; i < importedIds.length; i += 100) {
  const chunk = importedIds.slice(i, i + 100)
  const { error, count } = await sb.from('leads').delete({ count: 'exact' }).in('id', chunk)
  if (error) throw error
  deleted += count ?? chunk.length
}
console.log(`✅ Șterse: ${deleted}`)

// --- 2. restore cei 4 reali din backup ---
const bak = JSON.parse(fs.readFileSync('scripts/migrate/_pre_wipe_backup_20260622/leads.json', 'utf8'))
const impSet = new Set(importedIds)
const reals = bak.filter(
  (l) => !impSet.has(l.id) && l.sursa && !/test/i.test(l.nume || ''),
)
console.log(`\nDe restaurat: ${reals.length}`)
for (const r of reals) console.log('  +', r.nume, '|', r.status, '|', String(r.created).slice(0, 10))

const { error: insErr } = await sb.from('leads').upsert(reals, { onConflict: 'id', defaultToNull: false })
if (insErr) throw insErr
console.log('✅ Restaurate.')

// --- raport final ---
const { count: total } = await sb.from('leads').select('id', { count: 'exact', head: true })
console.log(`\nTotal lead-uri în DB acum: ${total}`)
