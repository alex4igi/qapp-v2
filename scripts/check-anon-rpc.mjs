// Verifică invariantul de securitate: NICIO funcție `security definer` non-trigger din
// schema public nu trebuie să fie apelabilă de rolul `anon` (cheia publică din bundle).
//
// Capcana (audit 2026-07-17): default privileges Supabase acordă anon EXECUTE pe orice
// funcție nouă, iar `auth_role()` cade pe 'front_desk' pentru requesturile fără rol —
// deci RPC-uri security definer deveneau apelabile public (inclusiv mutații financiare).
// Fix + convenție: fiecare RPC nou face `revoke execute ... from anon` (+ from public
// dacă e cazul). Gardianul din DB (anon_rpc_gap_report) sare peste funcțiile chemate
// dintr-o politică RLS scrisă pentru rolul public — din 2026-09-23 nu mai e niciuna
// (politicile de pe salarii_teacher s-au legat explicit de `authenticated`).
//
// Rulare:  node scripts/check-anon-rpc.mjs
// Exit 0 = totul închis; exit 1 = există funcții încă apelabile de anon (listate).
// DE RULAT după orice migrație care creează funcții security definer.

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
const URL_ = env.VITE_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !SERVICE) throw new Error('lipsesc cheile în .env.local')

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })

const { data, error } = await svc.rpc('anon_rpc_gap_report')
if (error) throw new Error(`anon_rpc_gap_report: ${error.message}`)

if (!data || data.length === 0) {
  console.log('✅ Nicio funcție security definer nu e apelabilă de anon.')
  process.exit(0)
}

console.log(`⚠️  ${data.length} funcții încă apelabile de anon:\n`)
for (const row of data) console.log(`  - ${row.functie}`)
console.log('\nAdaugă `revoke execute on function <sig> from anon, public;` în migrație.')
process.exit(1)
