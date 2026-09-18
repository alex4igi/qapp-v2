// Șterge definitiv fixture-ul de test al portalului (ZZTEST) din producție.
// Fixture-ul stătea pe cursuri REALE din Vara 2026 și intra în rapoartele de
// încasări, roster și ocupare. Se poate reface oricând: node scripts/seed-portal-test.mjs
//
//   node scripts/cleanup/delete-fixture-portal-zztest.mjs [--dry]

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry')

const FAM = 'a272948d-77cd-44a8-ab6b-d8455eb38dfd'
const CLIENTI = ['20dce69f-3dfb-462e-99bb-012819276eb7', 'abddc8ca-9e99-4001-b265-dffcb84eb52a']
const EMAILS = ['portal.test@quasardance.ro', 'portal.adult@quasardance.ro']

const get = async (t, q) => { const { data, error } = await q; if (error) throw new Error(`${t}: ${error.message}`); return data ?? [] }

const enrs = await get('enrollments', svc.from('enrollments').select('*').in('client', CLIENTI))
const eids = enrs.map((e) => e.id)
const sesiuni = await get('open_sesiuni', svc.from('open_sesiuni').select('*').like('observatii', 'ZZTEST%'))
const sids = sesiuni.map((s) => s.id)

const backup = {
  generat_la: new Date().toISOString(),
  motiv: 'Fixture portal ZZTEST sters din productie — polua incasarile aug/sept si ocuparea grupelor',
  familii: await get('familii', svc.from('familii').select('*').eq('id', FAM)),
  clienti: await get('clienti', svc.from('clienti').select('*').in('id', CLIENTI)),
  enrollments: enrs,
  incasari: await get('incasari', svc.from('incasari').select('*').in('client', CLIENTI)),
  prezente: await get('prezente', svc.from('prezente').select('*').in('client', CLIENTI)),
  open_sesiuni: sesiuni,
  open_rezervari: sids.length ? await get('open_rezervari', svc.from('open_rezervari').select('*').in('sesiune', sids)) : [],
  // hash-urile de parola NU se salveaza (fisierul sta in repo); contul se reface din seed
  portal_accounts: (await get('portal_accounts', svc.from('portal_accounts').select('*').in('email', EMAILS)))
    .map(({ password_hash, ...rest }) => ({ ...rest, password_hash: '(redactat)' })),
}

const out = new URL('./_backup_fixture_portal_zztest_20260918.json', import.meta.url)
writeFileSync(out, JSON.stringify(backup, null, 2))
console.log('✓ backup →', out.pathname)
for (const [k, v] of Object.entries(backup)) if (Array.isArray(v)) console.log(`   ${k}: ${v.length}`)

if (DRY) { console.log('\n--dry: nu sterg nimic'); process.exit(0) }

const del = async (label, q) => { const { error, count } = await q; if (error) throw new Error(`${label}: ${error.message}`); console.log(`  − ${label}: ${count ?? '?'}`) }

console.log('\nSterg (ordine FK):')
await del('incasari', svc.from('incasari').delete({ count: 'exact' }).in('client', CLIENTI))
await del('prezente', svc.from('prezente').delete({ count: 'exact' }).in('client', CLIENTI))
if (eids.length) await del('enrollments', svc.from('enrollments').delete({ count: 'exact' }).in('id', eids))
if (sids.length) {
  await del('open_rezervari', svc.from('open_rezervari').delete({ count: 'exact' }).in('sesiune', sids))
  await del('open_sesiuni', svc.from('open_sesiuni').delete({ count: 'exact' }).in('id', sids))
}
await del('clienti', svc.from('clienti').delete({ count: 'exact' }).in('id', CLIENTI))
await del('familii', svc.from('familii').delete({ count: 'exact' }).eq('id', FAM))
await del('portal_accounts', svc.from('portal_accounts').delete({ count: 'exact' }).in('email', EMAILS))

const rest = {
  clienti: (await get('v', svc.from('clienti').select('id').in('id', CLIENTI))).length,
  familii: (await get('v', svc.from('familii').select('id').eq('id', FAM))).length,
  incasari: (await get('v', svc.from('incasari').select('id').in('client', CLIENTI))).length,
  portal_accounts: (await get('v', svc.from('portal_accounts').select('id').in('email', EMAILS))).length,
}
console.log('\nVerificare (trebuie 0 peste tot):', rest)
