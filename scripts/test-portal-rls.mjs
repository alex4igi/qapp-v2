// Test adversarial RLS pentru portalul de membru (rol `parinte`).
// Verifică izolarea: un cont de familie NU poate citi datele altei familii,
// nici direct pe tabele, nici prin RPC-uri cross-family.
//
// Rulare:  node scripts/test-portal-rls.mjs
// Creează date de test, rulează aserțiile, apoi CURĂȚĂ tot (DB rămâne curat).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// --- încarcă .env.local ---
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
const ANON = env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !ANON || !SERVICE) throw new Error('lipsesc cheile în .env.local')

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })

const TAG = 'RLSTEST_' + Date.now()
const PWD = 'Test12345!'
const EMAIL = `rlstest_${Date.now()}@example.invalid`

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

const created = { familii: [], clienti: [], prezente: [], userId: null }

async function main() {
  // ── SETUP ───────────────────────────────────────────────────────────────
  const { data: famA } = await svc.from('familii').insert({ nume_familie: `${TAG}_A` }).select('id').single()
  const { data: famB } = await svc.from('familii').insert({ nume_familie: `${TAG}_B` }).select('id').single()
  created.familii.push(famA.id, famB.id)

  const { data: a1 } = await svc.from('clienti').insert({ nume: `${TAG}_A1`, familia: famA.id }).select('id').single()
  const { data: b1 } = await svc.from('clienti').insert({ nume: `${TAG}_B1`, familia: famB.id }).select('id').single()
  created.clienti.push(a1.id, b1.id)

  // o prezență pt fiecare → dacă izolarea cedează, ar fi vizibilă cross-family
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const { data: pB } = await svc.from('prezente').insert({ client: b1.id, data: today, status: 'Prezent' }).select('id').single()
  const { data: pA } = await svc.from('prezente').insert({ client: a1.id, data: today, status: 'Prezent' }).select('id').single()
  created.prezente.push(pB.id, pA.id)

  // provisioning cont `parinte` legat de familia A (ce face edge function provision-client)
  const { data: u, error: uErr } = await svc.auth.admin.createUser({
    email: EMAIL, password: PWD, email_confirm: true, app_metadata: { role: 'parinte' },
  })
  if (uErr) throw uErr
  created.userId = u.user.id
  await svc.from('familii').update({ auth_user_id: u.user.id }).eq('id', famA.id)

  // ── ACT: loghează-te ca parinte A pe clientul anon ───────────────────────
  const cli = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error: signErr } = await cli.auth.signInWithPassword({ email: EMAIL, password: PWD })
  if (signErr) throw signErr

  // ── ASSERT ───────────────────────────────────────────────────────────────
  console.log(`\nAserții izolare (parinte familia A, ${EMAIL}):`)

  // 1. SELECT direct pe tabele → 0 rânduri (politica RESTRICTIVE deny_parinte_direct)
  const { data: directClienti } = await cli.from('clienti').select('id')
  check('direct .from(clienti) → 0 rânduri', (directClienti?.length ?? 0) === 0, `(a întors ${directClienti?.length})`)

  const { data: directPrezente } = await cli.from('prezente').select('id')
  check('direct .from(prezente) → 0 rânduri', (directPrezente?.length ?? 0) === 0, `(a întors ${directPrezente?.length})`)

  const { data: directFamilii } = await cli.from('familii').select('id')
  check('direct .from(familii) → 0 rânduri', (directFamilii?.length ?? 0) === 0, `(a întors ${directFamilii?.length})`)

  // 2. RPC cross-family: prezențele lui B1 cerute de parinte A → 0
  const { data: prezB } = await cli.rpc('get_prezente_client', { p_client: b1.id })
  check('get_prezente_client(B1) → 0 (cross-family blocat)', (prezB?.length ?? 0) === 0, `(a întors ${prezB?.length})`)

  // 3. RPC propriu: prezențele lui A1 → permis (≥1, nu eroare)
  const { data: prezA, error: prezAErr } = await cli.rpc('get_prezente_client', { p_client: a1.id })
  check('get_prezente_client(A1) → permis', !prezAErr && (prezA?.length ?? 0) >= 1, `(err=${prezAErr?.message}, n=${prezA?.length})`)

  // 4. get_sold_familie → niciun client_id din familia B
  const { data: sold } = await cli.rpc('get_sold_familie')
  const leaked = (sold ?? []).some((r) => r.client_id === b1.id)
  check('get_sold_familie → fără membrii familiei B', !leaked)

  await cli.auth.signOut()
}

async function cleanup() {
  console.log('\nCleanup…')
  for (const id of created.prezente) await svc.from('prezente').delete().eq('id', id)
  for (const id of created.clienti) await svc.from('clienti').delete().eq('id', id)
  for (const id of created.familii) await svc.from('familii').delete().eq('id', id)
  if (created.userId) await svc.auth.admin.deleteUser(created.userId)
  console.log('  date de test șterse')
}

try {
  await main()
} catch (e) {
  console.error('EROARE:', e.message ?? e)
  fail++
} finally {
  await cleanup()
}

console.log(`\nRezultat: ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
