// Test fișă editabilă portal: round-trip salvare + izolare la SCRIERE cross-family.
// Rulare: node scripts/test-portal-profil.mjs   (creează date, testează, curăță)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const T = 'PROFTEST_' + Date.now(), EMAIL = `proftest_${Date.now()}@example.invalid`, PWD = 'Test12345!'
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }
const c = { fam: [], cli: [], uid: null }

try {
  const { data: famA } = await svc.from('familii').insert({ nume_familie: `${T}_A` }).select('id').single()
  const { data: famB } = await svc.from('familii').insert({ nume_familie: `${T}_B` }).select('id').single()
  c.fam.push(famA.id, famB.id)
  const { data: a1 } = await svc.from('clienti').insert({ nume: `${T}_A1`, familia: famA.id }).select('id').single()
  const { data: b1 } = await svc.from('clienti').insert({ nume: `${T}_B1`, familia: famB.id }).select('id').single()
  c.cli.push(a1.id, b1.id)
  const { data: u } = await svc.auth.admin.createUser({ email: EMAIL, password: PWD, email_confirm: true, app_metadata: { role: 'parinte' } })
  c.uid = u.user.id
  await svc.from('familii').update({ auth_user_id: u.user.id }).eq('id', famA.id)

  const cli = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  await cli.auth.signInWithPassword({ email: EMAIL, password: PWD })

  console.log('\nFișă editabilă (parinte familia A):')

  // get profil familie
  const { data: pf } = await cli.rpc('get_profil_familie')
  check('get_profil_familie → familia A', pf?.[0]?.familie_id === famA.id)

  // update familie + firmă, re-citește
  await cli.rpc('update_profil_familie', {
    p_nume_reprezentant: 'Ion', p_telefon: '0700111222',
    p_factura_pe_firma: true, p_firma_cif: 'RO12345', p_firma_denumire: 'ACME SRL',
  })
  const { data: pf2 } = await cli.rpc('get_profil_familie')
  check('update_profil_familie persistă', pf2?.[0]?.nume_reprezentant === 'Ion' && pf2?.[0]?.firma_cif === 'RO12345' && pf2?.[0]?.factura_pe_firma === true,
    JSON.stringify(pf2?.[0]))

  // update client A1 (marime_tricou) + re-citește
  await cli.rpc('update_profil_client', { p_client: a1.id, p_marime_tricou: 'M', p_telefon: '0733000111' })
  const { data: pc } = await cli.rpc('get_profil_client', { p_client: a1.id })
  check('update_profil_client(A1) persistă', pc?.[0]?.marime_tricou === 'M' && pc?.[0]?.telefon === '0733000111', JSON.stringify(pc?.[0]))

  // ADVERSARIAL: scriere pe membru din familia B → trebuie să eșueze
  const { error: wErr } = await cli.rpc('update_profil_client', { p_client: b1.id, p_marime_tricou: 'XL' })
  check('update_profil_client(B1) → BLOCAT', !!wErr, `(err=${wErr?.message ?? 'NICIUNA — LEAK!'})`)
  // și confirmă că B1 chiar n-a fost modificat
  const { data: b1row } = await svc.from('clienti').select('marime_tricou').eq('id', b1.id).single()
  check('B1 nemodificat în DB', b1row?.marime_tricou == null, `(=${b1row?.marime_tricou})`)

  // citire cross-family → gol
  const { data: pcB } = await cli.rpc('get_profil_client', { p_client: b1.id })
  check('get_profil_client(B1) → gol', (pcB?.length ?? 0) === 0)

  await cli.auth.signOut()
} catch (e) {
  console.error('EROARE:', e.message ?? e); fail++
} finally {
  console.log('\nCleanup…')
  for (const id of c.cli) await svc.from('clienti').delete().eq('id', id)
  for (const id of c.fam) await svc.from('familii').delete().eq('id', id)
  if (c.uid) await svc.auth.admin.deleteUser(c.uid)
  console.log('  date de test șterse')
}
console.log(`\nRezultat: ${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
