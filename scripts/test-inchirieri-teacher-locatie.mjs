// Test RLS închirieri: un instructor legat de o locație (Nicolina) poate rezerva
// o sală de la ALTĂ locație (Ștefan cel Mare) — regula „doar la locația ta" a fost
// scoasă pentru teacher în 20260728120000. Restul gardurilor trebuie să țină:
// rezervă doar pentru el, doar tier 'staff', fără bani.
//
// Rulare:  node scripts/test-inchirieri-teacher-locatie.mjs
// Exit 0 = totul verde. Nu lasă date în urmă.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const parseEnv = (p) => Object.fromEntries(
  readFileSync(p, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const env = parseEnv(fileURLToPath(new URL('../.env.local', import.meta.url)))
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SB, SVC, { auth: { persistSession: false } })
const log = (...a) => console.log(...a)
let fails = 0
const assert = (cond, msg) => { if (cond) log('  ✓', msg); else { fails++; log('  ✗ FAIL:', msg) } }

const EMAIL = 'zztest_teacher_locatie@quasardance.test'
const PASS = 'ZzTest!2026'
const DATA = '2027-01-05' // dată liberă, departe de orarul curent

let authUserId = null
let teacherId = null
let altTeacherId = null
const rentals = []

const slot = (sala, ora, ok, extra = {}) => ({
  sala, data: DATA, ora_start: ora, ora_final: ok, durata_min: 60,
  tier: 'staff', pret: 0, status_plata: 'neachitat', ...extra,
})

try {
  log('— Setup —')
  const { data: locatii } = await admin.from('locatii').select('id, nume')
  const nicolina = locatii.find((l) => l.nume.toLowerCase().includes('nicolina'))
  const scm = locatii.find((l) => l.nume.toLowerCase().includes('stefan'))
  const { data: sali } = await admin.from('sali').select('id, nume, locatie')
  const salaScm = sali.find((s) => s.locatie === scm.id)
  const salaNic = sali.find((s) => s.locatie === nicolina.id)
  log(`  locații: ${nicolina.nume} / ${scm.nume} · săli: ${salaNic.nume} / ${salaScm.nume}`)

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 500 })
  const leftover = list?.users?.find((u) => u.email === EMAIL)
  if (leftover) await admin.auth.admin.deleteUser(leftover.id)

  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
    app_metadata: { role: 'teacher', locatie_id: nicolina.id },
  })
  if (uErr) throw uErr
  authUserId = created.user.id

  const { data: t, error: tErr } = await admin.from('teacheri')
    .insert({ nume: 'ZZTEST', prenume: 'Nicolina', auth_user_id: authUserId })
    .select('id').single()
  if (tErr) throw tErr
  teacherId = t.id

  const { data: t2, error: t2Err } = await admin.from('teacheri')
    .insert({ nume: 'ZZTEST', prenume: 'Altcineva' }).select('id').single()
  if (t2Err) throw t2Err
  altTeacherId = t2.id
  log('  instructor ZZTEST (cont locatie=Nicolina) + un al doilea instructor')

  const teacher = createClient(SB, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await teacher.auth.signInWithPassword({ email: EMAIL, password: PASS })
  if (sErr) throw sErr

  log('— Test 1: rezervare pe ALTĂ locație (Ștefan cel Mare) —')
  const { data: r1, error: e1 } = await teacher.from('inchirieri')
    .insert(slot(salaScm.id, '07:00', '08:00', { teacher: teacherId }))
    .select('id, locatie').single()
  if (r1) rentals.push(r1.id)
  assert(!e1 && r1, `insert acceptat pe ${salaScm.nume}${e1 ? ` (eroare: ${e1.message})` : ''}`)
  assert(r1?.locatie === scm.id, 'locatie completată automat din sală (trigger)')

  log('— Test 2: rezervare la locația proprie (Nicolina) merge în continuare —')
  const { data: r2, error: e2 } = await teacher.from('inchirieri')
    .insert(slot(salaNic.id, '07:00', '08:00', { teacher: teacherId }))
    .select('id').single()
  if (r2) rentals.push(r2.id)
  assert(!e2 && r2, `insert acceptat pe ${salaNic.nume}${e2 ? ` (eroare: ${e2.message})` : ''}`)

  log('— Test 3: gardurile rămase —')
  const { data: r3, error: e3 } = await teacher.from('inchirieri')
    .insert(slot(salaScm.id, '09:00', '10:00', { teacher: altTeacherId })).select('id').single()
  if (r3) rentals.push(r3.id)
  assert(!!e3, 'NU poate rezerva pentru alt instructor')

  const { data: r4, error: e4 } = await teacher.from('inchirieri')
    .insert(slot(salaScm.id, '10:00', '11:00', { teacher: teacherId, tier: 'client' }))
    .select('id').single()
  if (r4) rentals.push(r4.id)
  assert(!!e4, "NU poate rezerva pe tarif 'client'")

  const { data: r5, error: e5 } = await teacher.from('inchirieri')
    .insert(slot(salaScm.id, '11:00', '12:00', { teacher: teacherId, pret: 100, status_plata: 'achitat' }))
    .select('id').single()
  if (r5) rentals.push(r5.id)
  assert(!!e5, 'NU poate marca o rezervare drept achitată (banii sunt la recepție)')
} finally {
  log('— Cleanup —')
  for (const id of rentals) await admin.from('inchirieri').delete().eq('id', id)
  if (teacherId) await admin.from('teacheri').delete().eq('id', teacherId)
  if (altTeacherId) await admin.from('teacheri').delete().eq('id', altTeacherId)
  if (authUserId) await admin.auth.admin.deleteUser(authUserId)
  const { data: rest } = await admin.from('teacheri').select('id').eq('nume', 'ZZTEST')
  log(`  șters: ${rentals.length} închirieri, 2 instructori, 1 cont · rămase ZZTEST: ${rest?.length ?? 0}`)
}

log(fails === 0 ? '\n✅ Toate testele trec.' : `\n❌ ${fails} test(e) picate.`)
process.exit(fails === 0 ? 0 : 1)
