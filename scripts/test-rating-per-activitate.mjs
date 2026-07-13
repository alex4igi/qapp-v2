// Test e2e pentru rating-ul per activitate (curs/eveniment) din portal → CRM.
// Se loghează ca parinte (contul de test ZZTEST) și apelează RPC-urile reale.
// Rulare:  node scripts/test-rating-per-activitate.mjs
// Curăță tot la final (feedback + evenimentul de test).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const URL_ = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } })

const EMAIL = 'portal.test@quasardance.ro'
const PWD = 'QuasarPortal!2026'

// Login prin edge function portal-auth (director separat portal_accounts, JWT HS256).
let portalToken = null
const cli = createClient(URL_, ANON, { accessToken: async () => portalToken ?? ANON })
async function portalLogin() {
  const res = await fetch(`${URL_}/functions/v1/portal-auth`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email: EMAIL, password: PWD }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new Error('login portal esuat: ' + JSON.stringify(data))
  portalToken = data.access_token
}

let pass = 0, fail = 0
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

const cleanup = { feedbackClientIds: [], evenimentId: null, sesiuneId: null, sesiune2Id: null, cursId: null }

async function main() {
  // ── login parinte ──
  await portalLogin()

  // ── găsește ZZTEST Ana + cursurile ei ──
  const { data: ana } = await svc.from('clienti').select('id, familia').ilike('nume', 'ZZTEST Ana%').single()
  if (!ana) throw new Error('ZZTEST Ana lipsește — rulează seed-ul')
  cleanup.feedbackClientIds.push(ana.id)

  // ── 1. lista activităților evaluabile ──
  const { data: acts, error: actsErr } = await cli.rpc('get_ratable_activities_client', { p_client: ana.id })
  check('get_ratable_activities_client fără eroare', !actsErr, actsErr?.message ?? '')
  const cursActs = (acts ?? []).filter((a) => a.kind === 'curs')
  check('întoarce cursurile recurente înrolate (>=1)', cursActs.length >= 1, `got ${cursActs.length}`)
  check('rating inițial null pe cursuri', cursActs.every((a) => a.rating == null), '')
  const target = cursActs[0]
  console.log(`    → curs țintă: ${target?.nume} (${target?.context})`)

  // ── 2. submit rating pe un curs ──
  const { error: subErr } = await cli.rpc('submit_rating_client', {
    p_client: ana.id, p_context: target.context, p_rating: 4, p_detalii: 'Foarte bun!', p_curs: target.id,
  })
  check('submit_rating_client (curs) fără eroare', !subErr, subErr?.message ?? '')

  const { data: acts2 } = await cli.rpc('get_ratable_activities_client', { p_client: ana.id })
  const t2 = (acts2 ?? []).find((a) => a.kind === 'curs' && a.id === target.id)
  check('ratingul apare la re-listare (=4)', t2?.rating === 4, `got ${t2?.rating}`)
  check('detaliile apar la re-listare', t2?.detalii === 'Foarte bun!', `got ${t2?.detalii}`)

  // ── 3. upsert: al doilea submit actualizează, nu duplică ──
  const { error: upErr } = await cli.rpc('submit_rating_client', {
    p_client: ana.id, p_context: target.context, p_rating: 2, p_detalii: 'M-am răzgândit', p_curs: target.id,
  })
  check('al doilea submit (upsert) fără eroare', !upErr, upErr?.message ?? '')
  const { data: rows } = await svc.from('feedback').select('id, rating, detalii, cursul, tip')
    .eq('autor', ana.id).eq('tip', 'Review').eq('cursul', target.id)
  check('un singur rând (upsert, nu duplică)', (rows ?? []).length === 1, `got ${rows?.length}`)
  check('ratingul actualizat la 2', rows?.[0]?.rating === 2, `got ${rows?.[0]?.rating}`)

  // ── 4. gard apartenență: curs în care NU e înrolată deloc ──
  const { data: anaEnr } = await svc.from('enrollments').select('cursul').eq('client', ana.id)
  const enrolledIds = (anaEnr ?? []).map((e) => e.cursul).filter(Boolean)
  const { data: strayCurs } = await svc.from('cursuri').select('id')
    .not('id', 'in', `(${enrolledIds.join(',')})`).limit(1).maybeSingle()
  if (strayCurs) {
    const { error: guardErr } = await cli.rpc('submit_rating_client', {
      p_client: ana.id, p_context: 'curs_recurent', p_rating: 5, p_curs: strayCurs.id,
    })
    check('gard: curs neevaluabil respins', !!guardErr, 'ar fi trebuit să dea eroare')
  }

  // ── 5. path sesiune OPEN (trecută, rezervată) — pe un curs ZZTEST dedicat, izolat de date reale ──
  const { data: zcurs, error: zErr } = await svc.from('cursuri').insert({
    numele: 'ZZTEST Curs OPEN rating', facultativ: true, pret_sedinta: 50,
  }).select('id').single()
  if (zErr) throw new Error('insert cursuri ZZTEST: ' + zErr.message)
  cleanup.cursId = zcurs.id
  const { data: ses, error: sesInsErr } = await svc.from('open_sesiuni').insert({
    curs: zcurs.id, data: '2026-07-01', capacitate: 10, status: 'activa', observatii: 'ZZTEST',
  }).select('id').single()
  if (sesInsErr) throw new Error('insert open_sesiuni: ' + sesInsErr.message)
  cleanup.sesiuneId = ses.id
  await svc.from('open_rezervari').insert({ sesiune: ses.id, client: ana.id, status: 'platit', suma: 50 })

  const { data: actsOpen } = await cli.rpc('get_ratable_activities_client', { p_client: ana.id })
  const sesAct = (actsOpen ?? []).find((a) => a.kind === 'open_sesiune' && a.id === ses.id)
  check('sesiunea OPEN trecută rezervată apare în listă', !!sesAct, '')
  check('numele sesiunii include data', /01\.07\.2026/.test(sesAct?.nume ?? ''), sesAct?.nume ?? '')

  const { error: sesSubErr } = await cli.rpc('submit_rating_client', {
    p_client: ana.id, p_context: 'open', p_rating: 3, p_detalii: 'OK sesiunea', p_sesiune: ses.id,
  })
  check('submit_rating_client (sesiune) fără eroare', !sesSubErr, sesSubErr?.message ?? '')
  const { data: sesRows } = await svc.from('feedback').select('id, rating, open_sesiune, cursul')
    .eq('autor', ana.id).eq('open_sesiune', ses.id)
  check('review sesiune salvat (rating=3, cursul null)',
    sesRows?.[0]?.rating === 3 && sesRows?.[0]?.cursul == null, JSON.stringify(sesRows?.[0]))

  // gard: sesiune nerezervată (a doua sesiune ZZTEST, fără rezervare pt Ana)
  const { data: ses2 } = await svc.from('open_sesiuni').insert({
    curs: zcurs.id, data: '2026-07-02', capacitate: 10, status: 'activa', observatii: 'ZZTEST',
  }).select('id').single()
  cleanup.sesiune2Id = ses2.id
  const { error: sesGuard } = await cli.rpc('submit_rating_client', {
    p_client: ana.id, p_context: 'open', p_rating: 5, p_sesiune: ses2.id,
  })
  check('gard: sesiune nerezervată respinsă', !!sesGuard, 'ar fi trebuit eroare')

  // CRM: rating agregat per sesiune (replică listOpenSesiuniRatings)
  const { data: crmSes } = await svc.from('feedback')
    .select('rating, open_sesiune').eq('tip', 'Review').not('rating', 'is', null).eq('open_sesiune', ses.id)
  check('CRM sesiune: găsește review-ul agregat', (crmSes ?? []).some((r) => r.rating === 3), '')

  // ── 6. path eveniment ──
  const { data: ev } = await svc.from('evenimente').insert({
    nume_eveniment: 'ZZTEST Eveniment rating', data: '2026-07-01', participant: [ana.id],
  }).select('id').single()
  cleanup.evenimentId = ev.id
  const { data: acts3 } = await cli.rpc('get_ratable_activities_client', { p_client: ana.id })
  const evAct = (acts3 ?? []).find((a) => a.kind === 'eveniment' && a.id === ev.id)
  check('evenimentul (participant) apare în listă', !!evAct, '')
  const { error: evSubErr } = await cli.rpc('submit_rating_client', {
    p_client: ana.id, p_context: 'eveniment', p_rating: 5, p_detalii: 'Super show', p_eveniment: ev.id,
  })
  check('submit_rating_client (eveniment) fără eroare', !evSubErr, evSubErr?.message ?? '')
  const { data: evRows } = await svc.from('feedback').select('id, rating, eveniment')
    .eq('autor', ana.id).eq('eveniment', ev.id)
  check('review-ul de eveniment salvat (rating=5)', evRows?.[0]?.rating === 5, `got ${evRows?.[0]?.rating}`)

  // ── 6. afișarea CRM: media pe curs (replică listReviews) ──
  const { data: crmRows } = await svc.from('feedback')
    .select('id, rating, detalii, nume, created').eq('tip', 'Review').not('rating', 'is', null)
    .eq('cursul', target.id)
  const ratings = (crmRows ?? []).map((r) => r.rating).filter((r) => r != null)
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null
  check('CRM curs: găsește review-ul pt medie', ratings.includes(2), `ratings=${ratings}`)
  console.log(`    → media pe curs = ${avg?.toFixed(1)} din ${ratings.length}`)

  // ── 7. /feedback exclude review-urile (filtrul .or) ──
  const { data: sesizari } = await svc.from('feedback').select('id, tip')
    .or('tip.is.null,tip.neq.Review').eq('cursul', target.id)
  const leakedReviews = (sesizari ?? []).filter((r) => r.tip === 'Review')
  check('/feedback nu conține review-uri', leakedReviews.length === 0, `leaked ${leakedReviews.length}`)
}

async function doCleanup() {
  if (cleanup.feedbackClientIds.length)
    await svc.from('feedback').delete().in('autor', cleanup.feedbackClientIds)
  for (const sid of [cleanup.sesiuneId, cleanup.sesiune2Id].filter(Boolean)) {
    await svc.from('open_rezervari').delete().eq('sesiune', sid)
    await svc.from('open_sesiuni').delete().eq('id', sid)
  }
  if (cleanup.cursId) await svc.from('cursuri').delete().eq('id', cleanup.cursId)
  if (cleanup.evenimentId)
    await svc.from('evenimente').delete().eq('id', cleanup.evenimentId)
}

main()
  .then(doCleanup, async (e) => { await doCleanup(); throw e })
  .then(() => {
    console.log(`\n${fail === 0 ? '✅' : '❌'} pass=${pass} fail=${fail}`)
    process.exit(fail === 0 ? 0 : 1)
  })
  .catch((e) => { console.error('EROARE:', e.message); process.exit(1) })
