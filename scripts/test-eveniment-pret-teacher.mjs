// Verifică regula nouă „prețul îl decide tipul, nu cursul" + garda de teacher
// (migrația 20260901235800): un workshop/o audiție legată de o grupă poate avea
// preț, teacherul poate edita restul câmpurilor, dar nu prețul.
//
// Rulează pe Supabase de PRODUCȚIE — fixture „ZZTEST", curățat la final.
//
//   node scripts/test-eveniment-pret-teacher.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SB, SVC, { auth: { persistSession: false } })
const log = (...a) => console.log(...a)
let fails = 0
const assert = (cond, msg) => { if (cond) log('  ✓', msg); else { fails++; log('  ✗ FAIL:', msg) } }

const EMAIL = 'zztest_eveniment_pret@quasardance.test'
const PASS = 'ZzTest!2026'
const DATA = '2027-02-10'

let authUserId = null, teacherId = null, cursId = null
const evenimente = []

try {
  log('— Setup —')
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 500 })
  const leftover = list?.users?.find((u) => u.email === EMAIL)
  if (leftover) await admin.auth.admin.deleteUser(leftover.id)

  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
    app_metadata: { role: 'teacher' },
  })
  if (uErr) throw uErr
  authUserId = created.user.id

  const { data: t, error: tErr } = await admin.from('teacheri')
    .insert({ nume: 'ZZTEST', prenume: 'Pret', auth_user_id: authUserId }).select('id').single()
  if (tErr) throw tErr
  teacherId = t.id

  const { data: c, error: cErr } = await admin.from('cursuri')
    .insert({ numele: 'ZZTEST grupa pret' }).select('id').single()
  if (cErr) throw cErr
  cursId = c.id
  const { error: ctErr } = await admin.from('cursuri_teacheri')
    .insert({ curs_id: cursId, teacher_id: teacherId, rol: 'titular' })
  if (ctErr) throw ctErr
  log('  teacher ZZTEST titular pe grupa ZZTEST')

  log('— Test 1: audiție legată de grupă, CU preț (scriere de manager) —')
  const { data: ev, error: evErr } = await admin.from('evenimente').insert({
    nume_eveniment: 'ZZTEST auditie cu pret', tip: 'Auditie', curs: cursId,
    data: DATA, ora: '11:00', pret_bilet: 60, public: false,
  }).select('id, pret_bilet').single()
  if (ev) evenimente.push(ev.id)
  assert(!evErr && ev?.pret_bilet === 60, `audiție de grupă cu 60 lei acceptată${evErr ? ` (eroare: ${evErr.message})` : ''}`)

  const teacher = createClient(SB, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await teacher.auth.signInWithPassword({ email: EMAIL, password: PASS })
  if (sErr) throw sErr

  log('— Test 2: teacherul editează ALT câmp pe audiția cu preț —')
  const { data: u1, error: e1 } = await teacher.from('evenimente')
    .update({ ora: '12:30' }).eq('id', ev.id).select('id, ora, pret_bilet')
  assert(!e1 && u1?.length === 1 && u1[0].ora === '12:30',
    `ora se poate schimba${e1 ? ` (eroare: ${e1.message})` : ''}`)
  assert(u1?.[0]?.pret_bilet === 60, 'prețul rămâne neatins')

  log('— Test 3: teacherul schimbă PREȚUL —')
  const { error: e2 } = await teacher.from('evenimente')
    .update({ pret_bilet: 10 }).eq('id', ev.id)
  assert(!!e2, `respins${e2 ? `: „${e2.message}"` : ' — DAR A TRECUT'}`)

  log('— Test 4: teacherul creează un eveniment de grupă CU preț —')
  const { data: n1, error: e3 } = await teacher.from('evenimente').insert({
    nume_eveniment: 'ZZTEST teacher cu pret', tip: 'Workshop', curs: cursId,
    data: DATA, pret_bilet: 100, public: false,
  }).select('id').single()
  if (n1) evenimente.push(n1.id)
  assert(!!e3, `respins${e3 ? `: „${e3.message}"` : ' — DAR A TRECUT'}`)

  log('— Test 5: teacherul creează un eveniment de grupă FĂRĂ preț —')
  const { data: n2, error: e4 } = await teacher.from('evenimente').insert({
    nume_eveniment: 'ZZTEST teacher fara pret', tip: 'Eveniment', curs: cursId,
    data: DATA, public: false,
  }).select('id').single()
  if (n2) evenimente.push(n2.id)
  assert(!e4 && n2, `acceptat${e4 ? ` (eroare: ${e4.message})` : ''}`)

  log('— Test 6: teacherul face evenimentul public —')
  const { error: e5 } = await teacher.from('evenimente')
    .update({ public: true }).eq('id', n2?.id ?? ev.id)
  assert(!!e5, `respins${e5 ? `: „${e5.message}"` : ' — DAR A TRECUT'}`)
} finally {
  log('— Cleanup —')
  for (const id of evenimente) await admin.from('evenimente').delete().eq('id', id)
  await admin.from('evenimente').delete().like('nume_eveniment', 'ZZTEST%')
  if (cursId) await admin.from('cursuri').delete().eq('id', cursId)
  if (teacherId) await admin.from('teacheri').delete().eq('id', teacherId)
  if (authUserId) await admin.auth.admin.deleteUser(authUserId)
  log('  fixture șters')
}

log(fails === 0 ? '\n✅ Toate testele au trecut.' : `\n❌ ${fails} test(e) picate.`)
process.exit(fails === 0 ? 0 : 1)
