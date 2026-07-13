// Test RLS + RPC pentru evenimentele de grupă (migrația 20260713200000).
// Verifică: teacherul scrie DOAR pe grupele lui, fără public/bilet; portalul
// vede evenimentele de grupă doar pentru membrii cu enrollment activ.
//
// Rulare:  node scripts/test-evenimente-grupa.mjs
// Creează date de test, rulează aserțiile, apoi CURĂȚĂ tot (DB rămâne curat).

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
const ANON = env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !ANON || !SERVICE) throw new Error('lipsesc cheile în .env.local')

const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })

const TAG = 'EVGRUPA_' + Date.now()
const PWD = 'Test12345!'
const EMAIL_T = `evgrupa_teacher_${Date.now()}@example.invalid`

// Portal: login prin edge function portal-auth cu contul de test ZZTEST
// (director separat portal_accounts + JWT HS256 — nu Supabase Auth).
const EMAIL_P = 'portal.test@quasardance.ro'
const PWD_P = 'QuasarPortal!2026'
let portalToken = null
async function portalLogin() {
  const res = await fetch(`${URL_}/functions/v1/portal-auth`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: EMAIL_P, password: PWD_P }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new Error('login portal esuat: ' + JSON.stringify(data))
  portalToken = data.access_token
}

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

const created = {
  evenimente: [], enrollments: [], clienti: [], familii: [],
  cursuri: [], teacheri: [], users: [],
}
const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

async function main() {
  // ── SETUP ────────────────────────────────────────────────────────────────
  const { data: uT, error: uTErr } = await svc.auth.admin.createUser({
    email: EMAIL_T, password: PWD, email_confirm: true, app_metadata: { role: 'teacher' },
  })
  if (uTErr) throw uTErr
  created.users.push(uT.user.id)

  const { data: t1, error: t1Err } = await svc.from('teacheri')
    .insert({ nume: `${TAG}_T1`, auth_user_id: uT.user.id }).select('id').single()
  if (t1Err) throw t1Err
  created.teacheri.push(t1.id)

  const { data: c1, error: c1Err } = await svc.from('cursuri')
    .insert({ numele: `${TAG}_C1` }).select('id').single()
  if (c1Err) throw c1Err
  const { data: c2, error: c2Err } = await svc.from('cursuri')
    .insert({ numele: `${TAG}_C2` }).select('id').single()
  if (c2Err) throw c2Err
  created.cursuri.push(c1.id, c2.id)
  const { error: ctErr } = await svc.from('cursuri_teacheri')
    .insert({ curs_id: c1.id, teacher_id: t1.id, rol: 'titular' })
  if (ctErr) throw ctErr

  // Membrii ZZTEST (familia contului de portal de test): Ana primește o înrolare
  // temporară pe C1 (vede evenimentul grupei); Mihai nu are → nu-l vede.
  const { data: ana } = await svc.from('clienti').select('id').ilike('nume', 'ZZTEST Ana%').single()
  const { data: mihai } = await svc.from('clienti').select('id').ilike('nume', 'ZZTEST Mihai%').single()
  if (!ana || !mihai) throw new Error('membrii ZZTEST lipsesc — rulează scripts/seed-portal-test.mjs')
  const clA = ana
  const clB = mihai

  const di = new Date().toISOString().slice(0, 8) + '01'
  const { data: enr, error: enrErr } = await svc.from('enrollments')
    .insert({ client: clA.id, cursul: c1.id, tip_plata: 'Per luna', suma_baza: 200, suma: 200, data_incepere: di, activ: true, reziliat: false })
    .select('id').single()
  if (enrErr) throw enrErr
  created.enrollments.push(enr.id)

  // eveniment studio-wide de referință (creat de service role)
  const { data: evStudio, error: evSErr } = await svc.from('evenimente')
    .insert({ nume_eveniment: `${TAG}_STUDIO`, data: futureDate }).select('id').single()
  if (evSErr) throw evSErr
  created.evenimente.push(evStudio.id)

  // ── ACT 1: ca teacher ────────────────────────────────────────────────────
  const cliT = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error: signTErr } = await cliT.auth.signInWithPassword({ email: EMAIL_T, password: PWD })
  if (signTErr) throw signTErr

  console.log(`\nAserții teacher (${EMAIL_T}):`)

  const ins1 = await cliT.from('evenimente')
    .insert({ nume_eveniment: `${TAG}_EV1`, data: futureDate, ora: '18:30', locatia: 'Parc Copou', curs: c1.id, public: false })
    .select('id').single()
  check('insert eveniment pe grupa proprie → OK', !ins1.error, `(${ins1.error?.message})`)
  if (ins1.data) created.evenimente.push(ins1.data.id)

  const ins2 = await cliT.from('evenimente')
    .insert({ nume_eveniment: `${TAG}_EV2`, data: futureDate, curs: c2.id })
    .select('id').single()
  check('insert pe grupă străină → BLOCAT', !!ins2.error)
  if (ins2.data) created.evenimente.push(ins2.data.id)

  const ins3 = await cliT.from('evenimente')
    .insert({ nume_eveniment: `${TAG}_EV3`, data: futureDate })
    .select('id').single()
  check('insert studio-wide (fără curs) → BLOCAT', !!ins3.error)
  if (ins3.data) created.evenimente.push(ins3.data.id)

  const ins4 = await cliT.from('evenimente')
    .insert({ nume_eveniment: `${TAG}_EV4`, data: futureDate, curs: c1.id, public: true })
    .select('id').single()
  check('insert cu public=true → BLOCAT', !!ins4.error)
  if (ins4.data) created.evenimente.push(ins4.data.id)

  const ins5 = await cliT.from('evenimente')
    .insert({ nume_eveniment: `${TAG}_EV5`, curs: c1.id })
    .select('id').single()
  check('insert fără dată → BLOCAT (constraint)', !!ins5.error)
  if (ins5.data) created.evenimente.push(ins5.data.id)

  const ins6 = await cliT.from('evenimente')
    .insert({ nume_eveniment: `${TAG}_EV6`, data: futureDate, curs: c1.id, pret_bilet: 50 })
    .select('id').single()
  check('insert cu pret_bilet → BLOCAT', !!ins6.error)
  if (ins6.data) created.evenimente.push(ins6.data.id)

  const upd1 = await cliT.from('evenimente')
    .update({ locatia: 'Stadion' }).eq('id', ins1.data?.id ?? '00000000-0000-0000-0000-000000000000')
    .select('id')
  check('update eveniment propriu → OK', !upd1.error && (upd1.data?.length ?? 0) === 1, `(${upd1.error?.message}, n=${upd1.data?.length})`)

  const upd2 = await cliT.from('evenimente')
    .update({ locatia: 'Hacked' }).eq('id', evStudio.id).select('id')
  check('update eveniment studio-wide → 0 rânduri', (upd2.data?.length ?? 0) === 0, `(n=${upd2.data?.length})`)

  const upd3 = await cliT.from('evenimente')
    .update({ curs: null }).eq('id', ins1.data?.id ?? '').select('id')
  check('mutare eveniment propriu → studio-wide → BLOCAT', !!upd3.error || (upd3.data?.length ?? 0) === 0)

  await cliT.auth.signOut()

  // ── ACT 2: ca parinte (portal, JWT HS256 din portal-auth) ────────────────
  await portalLogin()
  const cliP = createClient(URL_, ANON, { accessToken: async () => portalToken ?? ANON })

  console.log(`\nAserții portal (${EMAIL_P}):`)

  const rpcA = await cliP.rpc('get_evenimente_client', { p_client: clA.id })
  const idsA = (rpcA.data ?? []).map((r) => r.eveniment_id)
  check('get_evenimente_client(membru în grupă) include evenimentul grupei',
    !rpcA.error && idsA.includes(ins1.data?.id), `(err=${rpcA.error?.message})`)
  check('… include și evenimentul studio-wide', idsA.includes(evStudio.id))
  const rowGrupa = (rpcA.data ?? []).find((r) => r.eveniment_id === ins1.data?.id)
  check('… cu numele grupei + ora', rowGrupa?.curs_nume === `${TAG}_C1` && rowGrupa?.ora === '18:30',
    `(curs_nume=${rowGrupa?.curs_nume}, ora=${rowGrupa?.ora})`)

  const rpcB = await cliP.rpc('get_evenimente_client', { p_client: clB.id })
  const idsB = (rpcB.data ?? []).map((r) => r.eveniment_id)
  check('get_evenimente_client(membru fără înrolare pe grupă) NU include evenimentul grupei', !idsB.includes(ins1.data?.id))
  check('… dar include studio-wide', idsB.includes(evStudio.id))

  const rpcNoArg = await cliP.rpc('get_evenimente_client')
  const idsNo = (rpcNoArg.data ?? []).map((r) => r.eveniment_id)
  check('apel fără parametru (build vechi) → doar studio-wide',
    !rpcNoArg.error && idsNo.includes(evStudio.id) && !idsNo.includes(ins1.data?.id), `(err=${rpcNoArg.error?.message})`)

  // eveniment anulat → dispare din RPC
  if (ins1.data) {
    await svc.from('evenimente').update({ status: 'Anulat' }).eq('id', ins1.data.id)
    const rpcC = await cliP.rpc('get_evenimente_client', { p_client: clA.id })
    check('eveniment Anulat → exclus din portal',
      !(rpcC.data ?? []).some((r) => r.eveniment_id === ins1.data.id))
  }
}

async function cleanup() {
  console.log('\nCleanup…')
  for (const id of created.evenimente) await svc.from('evenimente').delete().eq('id', id)
  for (const id of created.enrollments) await svc.from('enrollments').delete().eq('id', id)
  for (const id of created.clienti) await svc.from('clienti').delete().eq('id', id)
  for (const id of created.familii) await svc.from('familii').delete().eq('id', id)
  for (const id of created.cursuri) {
    await svc.from('cursuri_teacheri').delete().eq('curs_id', id)
    await svc.from('cursuri').delete().eq('id', id)
  }
  for (const id of created.teacheri) await svc.from('teacheri').delete().eq('id', id)
  for (const id of created.users) await svc.auth.admin.deleteUser(id)
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
