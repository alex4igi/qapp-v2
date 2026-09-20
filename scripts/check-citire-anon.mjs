// Gardian: ce se vede cu CHEIA PUBLICĂ, fără login.
//
// O politică RLS scrisă `for select using (true)` fără `to authenticated` se aplică
// rolului `public` — deci și lui `anon`. Așa au fost citibile `organizatie_firme` și
// view-urile definer (audit 2026-09-20). Verificarea asta nu se uită la politici, ci
// întreabă efectiv API-ul cu cheia din browser și numără rândurile întoarse.
//
// NU printează niciun rând — doar numele tabelului și câte rânduri vede anonimul.
//
//   node scripts/check-citire-anon.mjs      # exit 1 dacă apare ceva nepermis
import fs from 'node:fs'

// Citire publică asumată (pagini publice: ofertă, bilete, produse). Fără date personale.
const PERMISE = new Set(['tarife_publice', 'bilete_publice', 'produse_publice'])

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
const service = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !service) { console.error('Lipsesc cheile în .env.local'); process.exit(2) }

// Lista de tabele/view-uri o luăm din schema OpenAPI a PostgREST (cu service_role).
const spec = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: service, Authorization: `Bearer ${service}`, Accept: 'application/openapi+json' },
})
if (!spec.ok) { console.error('OpenAPI:', spec.status, await spec.text()); process.exit(2) }
const paths = Object.keys((await spec.json()).paths ?? {})
  .filter((p) => p.startsWith('/') && p.length > 1 && !p.startsWith('/rpc/'))
  .map((p) => p.slice(1))
  .sort()

async function numara(t, key) {
  const r = await fetch(`${url}/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
  })
  if (!r.ok) return null
  return Number((r.headers.get('content-range') ?? '').split('/')[1] ?? 0)
}

// (1) Empiric: ce rânduri întoarce efectiv API-ul pe cheia publică.
//     RLS care refuză tot răspunde 200 cu zero rânduri, nu 403 — deci semnalul util
//     e „anonimul vede rânduri", nu „cererea a trecut".
const vizibile = []
for (const t of paths) {
  const n = await numara(t, anon)
  if (n && n > 0) vizibile.push({ t, n })
}

// (2) Din catalog: politici permisive de SELECT cu `using (true)` pe rolul `public`
//     (deci și `anon`). Prinde tabelul gol azi, care mâine se umple — exact tiparul
//     prin care `vacante` a stat deschis.
const cat = await fetch(`${url}/rest/v1/rpc/politici_publice_report`, {
  method: 'POST',
  headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
  body: '{}',
})
const politici = cat.ok ? await cat.json() : null
if (!politici) console.warn('⚠️  politici_publice_report indisponibil — doar verificarea empirică')

let probleme = 0
for (const { t, n } of vizibile) {
  if (PERMISE.has(t)) { console.log(`✅ ${t}: ${n} rânduri — citire publică asumată`); continue }
  console.error(`❌ ${t}: ${n} rânduri se citesc CU CHEIA PUBLICĂ, fără login`)
  probleme++
}
for (const p of politici ?? []) {
  if (PERMISE.has(p.tablename)) continue
  console.error(`❌ ${p.tablename}: politica \`${p.policyname}\` e \`using (true)\` pe rolul public — se aplică și lui anon`)
  probleme++
}

console.log(`\nverificate ${paths.length} tabele/view-uri expuse de API`)
if (probleme) { console.error(`${probleme} deschise nepermis.`); process.exit(1) }
console.log('✅ Nimic nu se citește fără login, în afara excepțiilor asumate.')
