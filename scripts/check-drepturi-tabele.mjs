// Gardian: rolurile publice ale API-ului (`anon`, `authenticated`) au voie DOAR la
// SELECT/INSERT/UPDATE/DELETE — singurele pe care le emite PostgREST și singurele
// filtrate de RLS. TRUNCATE nu trece prin RLS: un `truncate incasari` ar goli tabela
// indiferent de politici. REFERENCES/TRIGGER/MAINTAIN sunt DDL și mentenanță.
//
// Supabase le acordă implicit pe toate, deci un tabel creat din dashboard le poate
// primi înapoi — de-aia verificăm și default privileges. Vezi migrația 20260920...
//
// Invers: de la 30 oct. 2026 Supabase nu mai dă GRANT automat pe tabelele noi, deci o
// migrație care uită `grant ... to authenticated` lasă tabelul inaccesibil din aplicație.
//
//   node scripts/check-drepturi-tabele.mjs      # exit 1 la regres
import fs from 'node:fs'

const PERICULOASE = /[Dxtm]/ // TRUNCATE, REFERENCES, TRIGGER, MAINTAIN în notația ACL

// Tabele asumat doar-server: le ating numai edge functions cu service_role.
const DOAR_SERVER = new Set([
  'contract_tokens', // tokenurile linkurilor de semnare
  'rate_limit_hits', // plafonul de cereri pe endpointurile publice
])

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Lipsesc VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY în .env.local'); process.exit(2) }

const r = await fetch(`${url}/rest/v1/rpc/drepturi_tabele_report`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!r.ok) { console.error('drepturi_tabele_report:', r.status, await r.text()); process.exit(2) }
const raport = await r.json()

let probleme = 0
const g = raport.granturi_periculoase ?? []
if (g.length) {
  probleme += g.length
  const peTabel = new Map()
  for (const x of g) peTabel.set(x.tabel, [...(peTabel.get(x.tabel) ?? []), `${x.rol}:${x.drept}`])
  for (const [tabel, lista] of peTabel) console.error(`❌ ${tabel} — ${lista.join(', ')}`)
}

// Default privileges: doar rolul care creează efectiv tabele prin migrații (postgres)
// trebuie să fie strâns. `supabase_admin` e al platformei și nu-l putem schimba noi;
// îl semnalăm doar ca avertisment, ca să știi că un tabel creat din dashboard poate
// primi înapoi drepturile largi.
for (const d of raport.default_privileges ?? []) {
  const larg = (d.acl.match(/(anon|authenticated)=([a-zA-Z*]+)/g) ?? [])
    .filter((m) => PERICULOASE.test(m.split('=')[1]))
  if (!larg.length) continue
  if (d.creator === 'postgres') {
    console.error(`❌ default privileges (${d.creator}) dau înapoi drepturi largi: ${larg.join(' ')}`)
    probleme++
  } else {
    console.warn(`⚠️  default privileges ale platformei (${d.creator}) rămân largi — un tabel creat din dashboard le primește. Rulează gardianul după orice tabel creat din UI.`)
  }
}

for (const t of raport.fara_grant ?? []) {
  if (!t.service_role) {
    console.error(`❌ ${t.tabel} — service_role nu are SELECT (lipsește grant ... to service_role)`)
    probleme++
  } else if (!t.authenticated && !DOAR_SERVER.has(t.tabel)) {
    console.error(`❌ ${t.tabel} — authenticated nu are SELECT: aplicația primește „permission denied". Adaugă grant-ul în migrație sau, dacă e asumat doar-server, pune-l în DOAR_SERVER.`)
    probleme++
  }
}
for (const nume of DOAR_SERVER) {
  if (!(raport.fara_grant ?? []).some((t) => t.tabel === nume)) {
    console.warn(`⚠️  ${nume} e pe lista DOAR_SERVER, dar authenticated are acces (sau tabelul nu mai există) — verifică și scoate-l de pe listă.`)
  }
}

if (probleme) { console.error(`\n${probleme} probleme.`); process.exit(1) }
console.log('✅ anon/authenticated au doar SELECT/INSERT/UPDATE/DELETE, și fiecare tabel din public are GRANT pentru aplicație.')
