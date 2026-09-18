// Seed IDEMPOTENT pentru contul de test al portalului de membru (qapp-membri).
//
//   node scripts/seed-portal-test.mjs            → (re)construiește fixture-ul
//   node scripts/seed-portal-test.mjs --teardown → îl șterge complet
//
// ⚠️ Trăiește în Supabase-ul de PRODUCȚIE (nu avem mediu separat).
//
// IZOLARE (2026-09-18): fixture-ul NU mai atinge cursuri reale. Își creează
// propriul SEZON („ZZTEST · mediu de test") și propriile CURSURI în el. Cum
// enrollments.sezon_id se derivă din cursuri.sezon, iar incasari.sezon din
// înrolare, tot lanțul cade în sezonul de test → rosterele, ocuparea, salariile
// și statisticile pe sezon rămân curate.
//
// ⚠️ EXCEPȚIA: /plati filtrează pe dată/locație/categorie/metodă, NU pe sezon.
// Cele 2 încasări de test (120 + 70 lei) APAR în registrul de plăți și în
// totalul lunii curente cât timp fixture-ul există. De aceea rulează
// `--teardown` după ce termini de testat portalul.
//
// Credențiale:
//   familie:  portal.test@quasardance.ro  / QuasarPortal!2026
//   adult:    portal.adult@quasardance.ro / QuasarPortal!2026

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const EMAIL = 'portal.test@quasardance.ro'
const EMAIL_ADULT = 'portal.adult@quasardance.ro'
const PWD = 'QuasarPortal!2026'
const FAM = 'ZZTEST Portal (cont de test - nu sterge)'
const SEZON = 'ZZTEST · mediu de test'
const CURS_1 = 'ZZTEST Curs de test'
const CURS_2 = 'ZZTEST Curs de test 2'
const TAGS = ['ZZTEST%', 'PORTALTEST%'] // curăță și fixture-uri ad-hoc vechi
const EMAILS = [EMAIL, EMAIL_ADULT]

async function cleanup() {
  for (const tag of TAGS) {
    const { data: kids } = await svc.from('clienti').select('id').like('nume', tag)
    const ids = (kids ?? []).map((k) => k.id)
    if (ids.length) {
      // comenzi Netopia + rezervări OPEN ale clienților de test
      await svc.from('netopia_orders').delete().in('client_id', ids)
      await svc.from('open_rezervari').delete().in('client', ids)
      // încasările se șterg pe CLIENT, nu pe înrolare: cele fără `inregistrare`
      // (bilete, taxe) ar rămâne orfane și ar bloca ștergerea clientului.
      await svc.from('incasari').delete().in('client', ids)
      await svc.from('prezente').delete().in('client', ids)
      await svc.from('enrollments').delete().in('client', ids)
      await svc.from('clienti').delete().in('id', ids)
    }
    await svc.from('familii').delete().like('nume_familie', tag)
  }
  // sesiuni OPEN de test (marcate prin observatii)
  const { data: ses } = await svc.from('open_sesiuni').select('id').like('observatii', 'ZZTEST%')
  const sids = (ses ?? []).map((s) => s.id)
  if (sids.length) {
    await svc.from('open_rezervari').delete().in('sesiune', sids)
    await svc.from('open_sesiuni').delete().in('id', sids)
  }
  // cursurile + sezonul de test (după înrolări, altfel FK)
  const { data: crs } = await svc.from('cursuri').select('id').like('numele', 'ZZTEST%')
  const cids = (crs ?? []).map((c) => c.id)
  if (cids.length) {
    await svc.from('cursuri_teacheri').delete().in('curs_id', cids)
    await svc.from('cursuri').delete().in('id', cids)
  }
  await svc.from('sezoane').delete().like('numele_sezonului', 'ZZTEST%')
  // conturi de portal de test (director separat portal_accounts)
  await svc.from('portal_accounts').delete().in('email', EMAILS)
}

function isoDay(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}

// Sezon + cursuri proprii, ca fixture-ul să nu intre în rosterele reale.
async function seedMediuDeTest() {
  // Sezon propriu, cu datele calculate local — NU copiate din sezonul real:
  // începe pe 1 ale lunii trecute, ca înrolările fixture-ului (1 ale lunii
  // curente / trecute) să cadă ÎNĂUNTRUL lui. O înrolare dinaintea startului de
  // sezon produce o restanță fantomă pe luna 1 — exact capcana pe care o evităm.
  const now = new Date()
  const start = new Date(now); start.setMonth(start.getMonth() - 1); start.setDate(1)
  const final = new Date(start); final.setMonth(final.getMonth() + 10); final.setDate(18)

  // `activ: false` e esențial: set_incasare_sezon alege pe `activ desc`, deci
  // sezonul de test nu poate fura încasări reale care cad în același interval.
  const { data: sezon, error: eS } = await svc.from('sezoane')
    .insert({
      numele_sezonului: SEZON, tip: 'extra', stare: 'planificat', activ: false,
      data_incepere: isoDay(start), data_final: isoDay(final),
      scadenta_prima_rata: isoDay(new Date(start.getFullYear(), start.getMonth(), 20)),
      scadenta_ultima_rata: isoDay(new Date(final.getFullYear(), final.getMonth(), 7)),
      scadenta_plata_integrala: isoDay(new Date(start.getFullYear(), start.getMonth() + 1, 0)),
    })
    .select('id').single()
  if (eS) throw new Error(`sezon de test: ${eS.message}`)

  const { data: loc } = await svc.from('locatii').select('id').order('nume').limit(1).single()

  // Sezonul `extra` acceptă doar cursuri facultative (regulă de business în DB) —
  // se potrivește: fixture-ul testa deja înrolări pe cursuri facultative.
  const mk = (numele, extra) => ({
    numele, sezon: sezon.id, locatie: loc.id, facultativ: true, nivelul: 'Incepator',
    varsta: 'Varsity 11-15', capacitate_maxima: 10, zile: ['Luni'], ora: '18:00',
    // insertul e bulk: o coloană NOT NULL setată doar pe un rând ajunge null pe celălalt
    durata_cursului: 60, rezervari_online: false, ...extra,
  })
  const { data: cursuri, error: eC } = await svc.from('cursuri').insert([
    mk(CURS_1, { pret_lunar: 200 }),
    // preț/ședință > 0 și rezervări online → sesiunea OPEN de test
    mk(CURS_2, { pret_lunar: 150, pret_sedinta: 80, rezervari_online: true }),
  ]).select('id, numele')
  if (eC) throw new Error(`cursuri de test: ${eC.message}`)

  return {
    sezonId: sezon.id,
    locatieId: loc.id,
    curs: cursuri.find((c) => c.numele === CURS_1),
    curs2: cursuri.find((c) => c.numele === CURS_2),
  }
}

async function seed() {
  const { locatieId, curs, curs2 } = await seedMediuDeTest()

  // ===== Familie cu 2 copii =====
  const { data: fam } = await svc.from('familii')
    .insert({ nume_familie: FAM, email: EMAIL, telefon: '0700000000', nume_reprezentant: 'Maria', prenume_reprezentant: 'Test' })
    .select('id').single()
  const { data: ana } = await svc.from('clienti').insert({ nume: 'ZZTEST Ana', prenume: 'Test', familia: fam.id, data_nasterii: '2015-05-10' }).select('id').single()
  await svc.from('clienti').insert({ nume: 'ZZTEST Mihai', prenume: 'Test', familia: fam.id, data_nasterii: '2012-03-20' })

  const now = new Date()
  const ms = new Date(now); ms.setDate(1)
  const di = isoDay(ms)
  const today = isoDay(now)
  // luna trecută (pentru a doua înrolare → ordine FIFO veche→nou)
  const prevMs = new Date(now); prevMs.setMonth(prevMs.getMonth() - 1); prevMs.setDate(1)
  const diPrev = isoDay(prevMs)

  // înrolare 1: 200 plătit 120 → rest 80 (luna curentă)
  const { data: enr } = await svc.from('enrollments')
    .insert({ client: ana.id, cursul: curs.id, tip_plata: 'Per luna', suma_baza: 200, suma: 200, data_incepere: di, activ: true, reziliat: false })
    .select('id').single()
  await svc.from('incasari').insert({ inregistrare: enr.id, client: ana.id, data: today, suma: 120, categorie: 'Abonament', metoda: 'Card', locatie: locatieId })
  await svc.from('prezente').insert({ client: ana.id, enrollment: enr.id, data: today, status: 'Prezent' })
  await svc.from('prezente').insert({ client: ana.id, enrollment: enr.id, data: di, status: 'Absent' })
  // înrolare 2: 150 neplătită → rest 150 (luna trecută = mai veche în FIFO)
  await svc.from('enrollments')
    .insert({ client: ana.id, cursul: curs2.id, tip_plata: 'Per luna', suma_baza: 150, suma: 150, data_incepere: diPrev, activ: true, reziliat: false })

  const { data: famPid } = await svc.rpc('portal_upsert_credentials', { p_email: EMAIL, p_password: PWD })
  await svc.from('familii').update({ auth_user_id: famPid }).eq('id', fam.id)

  // ===== Adult individual FĂRĂ familie =====
  const { data: adultPid } = await svc.rpc('portal_upsert_credentials', { p_email: EMAIL_ADULT, p_password: PWD })
  const { data: adult } = await svc.from('clienti')
    .insert({ nume: 'ZZTEST Adult', prenume: 'Solo', data_nasterii: '1995-07-15', auth_user_id: adultPid, email: EMAIL_ADULT })
    .select('id').single()
  const { data: enrAdult } = await svc.from('enrollments')
    .insert({ client: adult.id, cursul: curs.id, tip_plata: 'Per luna', suma_baza: 170, suma: 170, data_incepere: di, activ: true, reziliat: false })
    .select('id').single()
  await svc.from('incasari').insert({ inregistrare: enrAdult.id, client: adult.id, data: today, suma: 70, categorie: 'Abonament', metoda: 'Card', locatie: locatieId })

  // ===== Sesiune OPEN viitoare (pentru testul „rezervă un class") =====
  const future = new Date(now); future.setDate(future.getDate() + 7)
  const { data: ses } = await svc.from('open_sesiuni')
    .insert({ curs: curs2.id, data: isoDay(future), capacitate: 2, observatii: 'ZZTEST seed - sesiune de test' })
    .select('id').single()

  return { openInfo: `${CURS_2} pe ${isoDay(future)} (cap 2, preț 80) ses=${ses.id}` }
}

if (process.argv.includes('--teardown')) {
  await cleanup()
  console.log('✓ Fixture portal ZZTEST șters complet (sezon + cursuri + clienți + plăți)')
  process.exit(0)
}

await cleanup()
const r = await seed()
console.log('✓ Fixture portal recreat — sezon propriu „' + SEZON + '", cursuri proprii')
console.log('  FAMILIE →', EMAIL, '/', PWD)
console.log('    ZZTEST Ana: 2 înrolări — rest 80 (' + CURS_1 + ') + rest 150 (' + CURS_2 + ') → FIFO total 230')
console.log('    ZZTEST Mihai: fără date')
console.log('  ADULT  →', EMAIL_ADULT, '/', PWD, '— ZZTEST Adult, rest 100 (fără familie)')
console.log('  SESIUNE OPEN:', r.openInfo)
console.log('')
console.log('  ⚠️  Cele 2 încasări de test (120 + 70 lei, azi) APAR în /plati și în totalul lunii —')
console.log('      /plati nu filtrează pe sezon. Rulează `node scripts/seed-portal-test.mjs --teardown`')
console.log('      după ce termini de testat.')
