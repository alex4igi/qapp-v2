// Testul fluxului de evaluări: rundă → completare → verificare → trimitere →
// aprobări întârziate → închidere cu expirare.
//
// Invariantul de fond pe care-l apără: NIMIC nu ajunge la părinte fără aprobarea
// managerului.
//
// Poarta (secțiunea B) se testează SEPARAT, autentificat ca `parinte`. Chemat ca
// admin, get_evaluari_client întoarce 0 rânduri oricum — e scopat pe
// client_member_ids() — deci un „portalul nu vede" rulat ca admin ar trece și dacă
// poarta ar lipsi cu totul. Testul cu două evaluări pe același client (una trimisă,
// una nu) izolează exact filtrul de stare.
//
// Rulare:  node scripts/test-evaluari-flux.mjs
// Creează o rundă „ZZTEST" pe o grupă reală și șterge tot la final.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const user = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

let esecuri = 0
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) esecuri++ }
const zi = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const rpc = async (name, args) => {
  const { data, error } = await user.rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

// Autentificare ca admin — RPC-urile refuză service role-ul (auth_role() cade pe
// front_desk fără JWT), exact cum trebuie.
const auth = await user.auth.signInWithPassword({
  email: 'claude.qa@quasardance.ro', password: 'QappTest2026!',
})
if (auth.error) throw new Error('login: ' + auth.error.message)

// Curățăm eventuale rămășițe dintr-o rulare anterioară.
const { data: vechi } = await admin.from('sesiuni_evaluare').select('id').like('nume', 'ZZTEST%')
for (const v of vechi ?? []) {
  await admin.from('evaluari').delete().eq('sesiune_id', v.id)
  await admin.from('sesiuni_evaluare').delete().eq('id', v.id)
}

// Grupă reală cu destui cursanți înrolați.
const { data: cursuri } = await admin.from('cursuri').select('id, numele, teacher, sezon').not('teacher', 'is', null).limit(60)
let CURS = null
for (const c of cursuri ?? []) {
  const { count } = await admin.from('enrollments').select('*', { count: 'exact', head: true }).eq('cursul', c.id).eq('reziliat', false)
  if (count && count >= 3) { CURS = c; break }
}
if (!CURS) throw new Error('nicio grupă cu ≥3 înrolări')
console.log(`grupa: ${CURS.numele}\n`)

let sesId = null
let clientPoarta = null
try {
  // ── 1) Runda ──────────────────────────────────────────────────────────────
  const { data: ses, error: e1 } = await admin.from('sesiuni_evaluare').insert({
    nume: 'ZZTEST Checkpoint', sezon_id: CURS.sezon,
    data_limita_teacher: zi(28), data_trimitere: zi(35), data_inchidere: zi(49), zile_avans: 28,
  }).select('*').single()
  if (e1) throw e1
  sesId = ses.id
  const { error: eg } = await admin.from('sesiune_evaluare_grupe').insert({ sesiune_id: sesId, curs_id: CURS.id })
  if (eg) throw eg

  // ── 2) Cronul deschide runda (azi = limita − zile_avans) ──────────────────
  const r1 = await rpc('proceseaza_sesiuni_evaluare')
  const st1 = (await admin.from('sesiuni_evaluare').select('stare').eq('id', sesId).single()).data.stare
  ok(st1 === 'deschisa', `cronul deschide runda la T−28 (stare=${st1}) ${JSON.stringify(r1)}`)

  // ── 3) Rosterul ───────────────────────────────────────────────────────────
  const roster = await rpc('roster_evaluare', { p_sesiune: sesId, p_curs: CURS.id })
  ok(roster.length > 0, `roster_evaluare: ${roster.length} cursanți așteptați`)

  // ── 4) Excepția scoate un cursant din denominator ─────────────────────────
  await rpc('exclude_cursant_evaluare', {
    p_sesiune: sesId, p_curs: CURS.id, p_client: roster[0].client_id,
    p_motiv: 'ZZTEST înscris săptămâna trecută',
  })
  const roster2 = await rpc('roster_evaluare', { p_sesiune: sesId, p_curs: CURS.id })
  ok(roster2.length === roster.length - 1, `excepția scade denominatorul: ${roster.length} → ${roster2.length}`)

  // ── 5) Completare + submit ────────────────────────────────────────────────
  const note = {
    skill_ritm: 9, skill_pasi_baza: 8, skill_coregrafie: 7, skill_izolari: 6,
    skill_coordonare: 10, skill_freeze: 5, skill_sincronizare: 9,
    skill_improvizatie: 4, skill_expresivitate: 8, skill_prezentare: 7,
  }
  const { error: eIns } = await admin.from('evaluari').insert(
    roster2.slice(1).map((x) => ({
      client: x.client_id, cursul: CURS.id, teacher: CURS.teacher, sesiune_id: sesId,
      stare: 'ciorna', feedback_general: 'ZZTEST feedback pentru părinte', ...note,
    })),
  )
  if (eIns) throw eIns

  let refuzat = null
  try { await rpc('submit_grupa_evaluare', { p_sesiune: sesId, p_curs: CURS.id }) }
  catch (e) { refuzat = e.message }
  ok(Boolean(refuzat) && refuzat.includes('de completat'), `submit refuzat cât timp lipsește cineva: „${refuzat?.slice(0, 70)}…"`)

  await admin.from('evaluari').insert({
    client: roster2[0].client_id, cursul: CURS.id, teacher: CURS.teacher, sesiune_id: sesId,
    stare: 'ciorna', feedback_general: 'ZZTEST feedback pentru părinte', ...note,
  })
  const nSub = await rpc('submit_grupa_evaluare', { p_sesiune: sesId, p_curs: CURS.id })
  ok(nSub === roster2.length, `submit complet: ${nSub} evaluări → de_verificat`)

  // ── 7) Managerul respinge una, aprobă o parte ─────────────────────────────
  const { data: deVerif } = await admin.from('evaluari').select('id, client').eq('sesiune_id', sesId).eq('stare', 'de_verificat')
  await rpc('respinge_evaluare', { p_id: deVerif[0].id, p_motiv: 'ZZTEST feedbackul e prea scurt' })
  const resp = (await admin.from('evaluari').select('stare, motiv_respingere').eq('id', deVerif[0].id).single()).data
  ok(resp.stare === 'respinsa' && resp.motiv_respingere?.includes('ZZTEST'), 'respingerea întoarce evaluarea cu motiv')

  const restul = deVerif.slice(1)
  const lot1 = restul.slice(0, Math.max(1, Math.floor(restul.length / 2))).map((x) => x.id)
  const nApr = await rpc('aproba_evaluari', { p_ids: lot1 })
  ok(nApr === lot1.length, `aprobate ${nApr} din ${restul.length} rămase`)

  // ── 8) Trimiterea: pleacă DOAR aprobatele ─────────────────────────────────
  await admin.from('sesiuni_evaluare').update({ data_limita_teacher: zi(0), data_trimitere: zi(0) }).eq('id', sesId)
  await rpc('proceseaza_sesiuni_evaluare')
  const dupa = (await admin.from('evaluari').select('stare').eq('sesiune_id', sesId)).data
  const n = (st) => dupa.filter((x) => x.stare === st).length
  ok(n('trimisa') === lot1.length && n('de_verificat') === restul.length - lot1.length,
    `au plecat exact aprobatele: ${n('trimisa')} trimise · ${n('de_verificat')} încă în verificare · ${n('respinsa')} respinse`)

  const st2 = (await admin.from('sesiuni_evaluare').select('stare').eq('id', sesId).single()).data.stare
  ok(st2 === 'verificare', `runda RĂMÂNE în verificare cât timp e ceva nerezolvat (stare=${st2})`)

  // ── 10) Aprobările întârziate pleacă la următoarea rulare ─────────────────
  const { data: intarziate } = await admin.from('evaluari').select('id').eq('sesiune_id', sesId).eq('stare', 'de_verificat')
  await rpc('aproba_evaluari', { p_ids: intarziate.map((x) => x.id) })
  await rpc('proceseaza_sesiuni_evaluare')
  const dupa2 = (await admin.from('evaluari').select('stare').eq('sesiune_id', sesId)).data
  ok(dupa2.filter((x) => x.stare === 'de_verificat').length === 0 &&
     dupa2.filter((x) => x.stare === 'trimisa').length === lot1.length + intarziate.length,
    `aprobările întârziate pleacă la rularea următoare: ${dupa2.filter((x) => x.stare === 'trimisa').length} trimise total`)

  // ── 11) Închiderea: ce n-a fost aprobat expiră ────────────────────────────
  await admin.from('sesiuni_evaluare').update({ data_inchidere: zi(0) }).eq('id', sesId)
  const r3 = await rpc('proceseaza_sesiuni_evaluare')
  const final = (await admin.from('evaluari').select('stare').eq('sesiune_id', sesId)).data
  const stF = (await admin.from('sesiuni_evaluare').select('stare').eq('id', sesId).single()).data.stare
  ok(final.filter((x) => x.stare === 'expirata').length === 1 && stF === 'inchisa',
    `închiderea: ${final.filter((x) => x.stare === 'expirata').length} expirată (cea respinsă), runda=${stF} ${JSON.stringify(r3)}`)

  // ── 12) Runda închisă iese din raza cronului ──────────────────────────────
  const r4 = await rpc('proceseaza_sesiuni_evaluare')
  ok(r4.inchise === 0 && r4.trimise === 0 && r4.deschise === 0,
    `runda închisă nu mai e atinsă: ${JSON.stringify(r4)}`)

  // ════════════════════════════════════════════════════════════════════════
  // B) POARTA PORTALULUI — cu un token de portal real
  // ════════════════════════════════════════════════════════════════════════
  // Contul de portal NU e un user Supabase Auth: portal-auth emite un JWT HS256 al
  // cărui `sub` e portal_accounts.id (spre care pointează clienti.auth_user_id).
  // Chemăm exact ca portalul, altfel auth.uid() nu se potrivește cu nimic.
  const login = await fetch(env.VITE_SUPABASE_URL + '/functions/v1/portal-auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'login', email: 'portal.test@quasardance.ro', password: 'QuasarPortal!2026' }),
  }).then((r) => r.json())
  if (!login.access_token) throw new Error('portal-auth login: ' + JSON.stringify(login).slice(0, 200))

  const parinte = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + login.access_token } },
  })

  // Client de unică folosință legat de contul de portal (a doua ramură din
  // client_member_ids). Primește TREI evaluări pe același curs — una trimisă, două
  // nu — ca singura variabilă rămasă să fie starea.
  const { data: cTest, error: eCt } = await admin.from('clienti').insert({
    nume: 'ZZTEST', prenume: 'Poarta', auth_user_id: login.account_id,
  }).select('id').single()
  if (eCt) throw eCt
  clientPoarta = cTest.id

  const baza = { client: clientPoarta, cursul: CURS.id, teacher: CURS.teacher, ...note }
  const { error: eEv } = await admin.from('evaluari').insert([
    { ...baza, stare: 'trimisa', feedback_general: 'ZZTEST trimisa', data_evaluarii: zi(-1) },
    { ...baza, stare: 'de_verificat', feedback_general: 'ZZTEST in verificare', data_evaluarii: zi(-2) },
    { ...baza, stare: 'expirata', feedback_general: 'ZZTEST expirata', data_evaluarii: zi(-3) },
  ])
  if (eEv) throw eEv

  const { data: vazute, error: eV } = await parinte.rpc('get_evaluari_client', { p_client: clientPoarta })
  if (eV) throw new Error('get_evaluari_client: ' + eV.message)
  ok((vazute ?? []).length === 1 && vazute[0].feedback_general === 'ZZTEST trimisa',
    `poarta: din 3 evaluări (trimisă + în verificare + expirată) părintele vede DOAR ${(vazute ?? []).length} — „${vazute?.[0]?.feedback_general ?? '—'}"`)
  ok(vazute?.[0]?.skill_ritm === 9,
    `scala ajunge intactă în portal: skill_ritm=${vazute?.[0]?.skill_ritm} trepte = ${(vazute?.[0]?.skill_ritm ?? 0) / 2} stele`)
} finally {
  // ── Cleanup ───────────────────────────────────────────────────────────────
  if (clientPoarta) {
    await admin.from('evaluari').delete().eq('client', clientPoarta)
    await admin.from('clienti').delete().eq('id', clientPoarta)
    console.log('🧹 cleanup: clientul de test al porții + cele 3 evaluări')
  }
  if (sesId) {
    const { data: cl } = await admin.from('evaluari').select('client').eq('sesiune_id', sesId)
    const clienti = [...new Set((cl ?? []).map((x) => x.client))]
    await admin.from('evaluari').delete().eq('sesiune_id', sesId)
    await admin.from('sesiuni_evaluare').delete().eq('id', sesId)
    const { data: an } = await admin.from('anunturi').select('id').eq('canal', 'client').contains('audienta', { sesiune_evaluare: sesId })
    for (const a of an ?? []) await admin.from('anunturi').delete().eq('id', a.id)
    await admin.from('notifications').delete().in('kind', ['evaluari_deschise', 'evaluari_reminder', 'evaluari_de_verificat', 'evaluari_expira', 'evaluari_expirate', 'evaluare_respinsa'])
    console.log(`\n🧹 cleanup: rundă + evaluări (${clienti.length} clienți) + anunț + notificări`)
  }
}

console.log(esecuri === 0 ? '\n✅ Toate verificările au trecut.' : `\n❌ ${esecuri} verificări au picat.`)
process.exit(esecuri === 0 ? 0 : 1)
