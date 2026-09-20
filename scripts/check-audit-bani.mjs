// Gardian: banii nu se schimbă fără urmă. `authenticated` nu are voie la UPDATE/DELETE
// direct pe `incasari` sau UPDATE pe `datorii` — modificările trec prin RPC-urile
// auditate (edit_incasare / corecteaza_metoda_incasare / delete_incasare), iar
// ștergerea unei datorii e prinsă de trigger. Vezi migrația 20260920151546.
//
//   node scripts/check-audit-bani.mjs      # exit 1 la regres
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Lipsesc VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY în .env.local'); process.exit(2) }

const r = await fetch(`${url}/rest/v1/rpc/audit_bani_report`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!r.ok) { console.error('audit_bani_report:', r.status, await r.text()); process.exit(2) }
const raport = await r.json()

let probleme = 0
for (const d of raport.drepturi_directe ?? []) {
  console.error(`❌ ${d.rol} are ${d.drept} direct pe ${d.tabel} — modificarea ar scăpa fără audit.`)
  probleme++
}
if (!raport.trigger_datorii) {
  console.error('❌ Lipsește trigger-ul trg_audit_datorie_stearsa pe `datorii`.')
  probleme++
}
for (const f of raport.rpc_lipsa ?? []) {
  console.error(`❌ Lipsește RPC-ul auditat \`${f}\`.`)
  probleme++
}

if (probleme) { console.error(`\n${probleme} probleme.`); process.exit(1) }
console.log('✅ Banii nu se pot modifica fără urmă: drepturi directe revocate, trigger și RPC-uri pe poziție.')
