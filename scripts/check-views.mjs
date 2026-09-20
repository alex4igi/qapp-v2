// Gardian: view-urile din `public` fără `security_invoker = true` rulează ca owner
// (postgres) și OCOLESC RLS — oricine are SELECT pe view vede tot ce e în tabelele de bază.
// Așa au ajuns publice `opt_out_list` și `datorii_rest` (audit 2026-09-20).
//
// Regulă: orice view nou se creează `with (security_invoker = true)`. Excepții asumate
// (citire publică intenționată, fără date personale) stau în ALLOWED de mai jos — și tot
// nu au voie să fie updatabile sau să aibă drepturi de scriere.
//
//   node scripts/check-views.mjs      # exit 1 la regres
import fs from 'node:fs'

const ALLOWED = new Set(['bilete_publice', 'produse_publice'])

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Lipsesc VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY în .env.local'); process.exit(2) }

const r = await fetch(`${url}/rest/v1/rpc/definer_views_report`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!r.ok) { console.error('definer_views_report:', r.status, await r.text()); process.exit(2) }
const rows = await r.json()

const bad = rows.filter((v) => !ALLOWED.has(v.view_name) || v.updatable)
if (bad.length === 0) {
  console.log(`✅ Toate view-urile sunt security_invoker (excepții asumate: ${[...ALLOWED].join(', ')}).`)
  process.exit(0)
}
console.error('❌ View-uri care rulează ca owner (ocolesc RLS) sau au drepturi de scriere:')
for (const v of bad) {
  console.error(`   - ${v.view_name}  anon:${v.anon_select ? 'SELECT' : '-'}  authenticated:${v.authenticated_select ? 'SELECT' : '-'}  ${v.updatable ? 'UPDATABLE!' : ''}`)
}
console.error('Fix: alter view public.<nume> set (security_invoker = true); revoke all on public.<nume> from anon;')
process.exit(1)
