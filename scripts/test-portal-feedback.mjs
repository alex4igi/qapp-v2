// Test e2e pentru canalul de feedback din portalul de membri (RPC submit_app_feedback_portal).
// Folosește contul de test PORTAL (portal.test@quasardance.ro) — vezi scripts/seed-portal-test.mjs.
// Re-rulabil, cu auto-cleanup (șterge rândurile de feedback + notificările create).
//
// Rulare: node scripts/test-portal-feedback.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const URL_ = env.VITE_SUPABASE_URL
const svc = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const PORTAL_EMAIL = 'portal.test@quasardance.ro'
const PORTAL_PWD = 'QuasarPortal!2026'
const T = `ZZTEST feedback ${Date.now()}`

let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }
const created = []

// apel RPC cu un token arbitrar (portal sau anon)
async function rpc(token, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/submit_app_feedback_portal`, {
    method: 'POST',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

try {
  // ---- login portal ----
  const login = await fetch(`${URL_}/functions/v1/portal-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: PORTAL_EMAIL, password: PORTAL_PWD }),
  }).then((r) => r.json())
  check('login portal', !!login.access_token, login.error ?? '')
  if (!login.access_token) throw new Error('fără token — rulează scripts/seed-portal-test.mjs')
  const token = login.access_token
  const accountId = login.account_id

  // ---- membrii contului (pt. p_client) ----
  const membri = await fetch(`${URL_}/rest/v1/rpc/get_membri_familie`, {
    method: 'POST',
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  }).then((r) => r.json())
  const clientId = Array.isArray(membri) && membri[0] ? (membri[0].client_id ?? membri[0].id) : null

  console.log('\nsubmit_app_feedback_portal:')

  // 1) trimitere validă
  const ok1 = await rpc(token, {
    p_tip: 'Bug', p_titlu: T, p_detalii: 'detalii de test',
    p_pagina: '/plati', p_user_agent: 'ZZTEST/1.0', p_client: clientId,
  })
  check('trimitere validă → id', ok1.status === 200 && typeof ok1.body === 'string', JSON.stringify(ok1.body))
  if (typeof ok1.body === 'string') created.push(ok1.body)

  // 2) rândul e corect scris
  const { data: row } = await svc.from('app_feedback').select('*').eq('id', created[0]).maybeSingle()
  check("sursa = 'portal'", row?.sursa === 'portal')
  check('autor_user_id null (FK spre auth.users evitat)', row?.autor_user_id === null)
  check('autor_portal_account_id = contul', row?.autor_portal_account_id === accountId)
  check('autor_email = emailul contului', row?.autor_email === PORTAL_EMAIL)
  check('autor_client_id scopat pe familie', !clientId || row?.autor_client_id === clientId)
  check('pagina + user_agent captate', row?.pagina === '/plati' && row?.user_agent === 'ZZTEST/1.0')

  // 3) notificare la owner/admin
  const { data: notif } = await svc.from('notifications').select('id, title, payload')
    .eq('kind', 'app_feedback_new').contains('payload', { feedback_id: created[0] })
  check('notificare owner/admin creată', (notif?.length ?? 0) > 0)
  check("titlul notificării marchează sursa", (notif?.[0]?.title ?? '').includes('MEMBRU'), notif?.[0]?.title)

  // 4) validări
  const gol = await rpc(token, { p_tip: 'Bug', p_titlu: '   ' })
  check('titlu gol → respins', gol.status >= 400)
  const tipRau = await rpc(token, { p_tip: 'Reclamatie', p_titlu: T })
  check('tip invalid → respins', tipRau.status >= 400)
  const altClient = await rpc(token, {
    p_tip: 'Idee', p_titlu: T, p_client: '00000000-0000-0000-0000-000000000001',
  })
  check('client din altă familie → respins', altClient.status >= 400)

  // 5) rate limit (5/oră) — mai trimitem 4 valide, a 6-a pică
  for (let i = 2; i <= 5; i++) {
    const r = await rpc(token, { p_tip: 'Idee', p_titlu: `${T} #${i}` })
    if (typeof r.body === 'string') created.push(r.body)
  }
  const overflow = await rpc(token, { p_tip: 'Idee', p_titlu: `${T} #6` })
  check('al 6-lea mesaj într-o oră → respins', overflow.status >= 400, JSON.stringify(overflow.body))
  if (typeof overflow.body === 'string') created.push(overflow.body)

  // 6) anon nu poate apela RPC-ul
  const anon = await rpc(env.VITE_SUPABASE_ANON_KEY, { p_tip: 'Bug', p_titlu: T })
  check('anon → respins', anon.status >= 400, JSON.stringify(anon.body))

  // 7) parinte nu poate scrie direct în tabel (deny_parinte_direct)
  const direct = await fetch(`${URL_}/rest/v1/app_feedback`, {
    method: 'POST',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({ tip: 'Bug', titlu: `${T} direct` }),
  })
  check('insert direct din parinte → respins', direct.status >= 400, String(direct.status))

  // 8) parinte nu poate citi tabelul
  const read = await fetch(`${URL_}/rest/v1/app_feedback?select=id&limit=1`, {
    headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  const readBody = await read.json().catch(() => null)
  check('select direct din parinte → gol/refuzat', read.status >= 400 || (Array.isArray(readBody) && readBody.length === 0))
} finally {
  for (const id of created) {
    await svc.from('notifications').delete().contains('payload', { feedback_id: id })
    await svc.from('app_feedback').delete().eq('id', id)
  }
  console.log(`\ncleanup: ${created.length} rânduri șterse`)
  console.log(`${pass} pass · ${fail} fail`)
  process.exit(fail ? 1 : 0)
}
