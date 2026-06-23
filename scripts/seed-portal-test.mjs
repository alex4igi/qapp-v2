// Seed IDEMPOTENT pentru contul de test al portalului de membru (qapp-membri).
// Re-rulabil oricând: curăță fixture-ul vechi și îl recreează în aceeași stare.
//
//   node scripts/seed-portal-test.mjs
//
// ⚠️ Trăiește în Supabase-ul de PRODUCȚIE (nu avem mediu separat). De aceea
// familia e numită „ZZTEST" — fixture vizibil și în qapp v2; NU e client real.
//
// Scenarii acoperite:
//   1. Familie cu 2 copii (switcher) — ZZTEST Ana + ZZTEST Mihai
//   2. Membru cu MAI MULTE înrolări cu rest (FIFO) — ZZTEST Ana (2 înrolări)
//   3. Adult individual FĂRĂ familie — cont separat portal.adult@quasardance.ro
//   4. Sesiune OPEN viitoare cu locuri — pentru testul „rezervă un class"
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
const TAGS = ['ZZTEST%', 'PORTALTEST%'] // curăță și fixture-uri ad-hoc vechi
const EMAILS = [EMAIL, EMAIL_ADULT]

async function cleanup() {
  for (const tag of TAGS) {
    const { data: kids } = await svc.from('clienti').select('id, auth_user_id').like('nume', tag)
    const ids = (kids ?? []).map((k) => k.id)
    if (ids.length) {
      // comenzi Netopia + rezervări OPEN ale clienților de test
      await svc.from('netopia_orders').delete().in('client_id', ids)
      await svc.from('open_rezervari').delete().in('client', ids)
      const { data: enrs } = await svc.from('enrollments').select('id').in('client', ids)
      const eids = (enrs ?? []).map((e) => e.id)
      if (eids.length) {
        await svc.from('incasari').delete().in('inregistrare', eids)
        await svc.from('prezente').delete().in('enrollment', eids)
        await svc.from('enrollments').delete().in('id', eids)
      }
      await svc.from('prezente').delete().in('client', ids)
      await svc.from('clienti').delete().in('id', ids)
    }
    await svc.from('familii').delete().like('nume_familie', tag)
  }
  // sesiuni OPEN de test (marcate prin observatii)
  await svc.from('open_sesiuni').delete().like('observatii', 'ZZTEST%')
  // conturi de portal de test (director separat portal_accounts)
  await svc.from('portal_accounts').delete().in('email', EMAILS)
}

function isoDay(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
}

async function seed() {
  // curs real (cu sală/locație) pentru ca plata să intre corect
  const { data: curs } = await svc.from('cursuri').select('id, numele, sala').not('sala', 'is', null).limit(1).single()
  const { data: sala } = await svc.from('sali').select('locatie').eq('id', curs.sala).single()
  // un al doilea curs (pentru a 2-a înrolare a Anei) — fallback pe același curs
  const { data: curs2row } = await svc.from('cursuri').select('id, numele').neq('id', curs.id).not('sala', 'is', null).limit(1).single()
  const curs2 = curs2row ?? { id: curs.id, numele: curs.numele }

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
  await svc.from('incasari').insert({ inregistrare: enr.id, client: ana.id, data: today, suma: 120, categorie: 'Abonament', metoda: 'Card', locatie: sala.locatie })
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
  await svc.from('incasari').insert({ inregistrare: enrAdult.id, client: adult.id, data: today, suma: 70, categorie: 'Abonament', metoda: 'Card', locatie: sala.locatie })

  // ===== Sesiune OPEN viitoare (pentru testul „rezervă un class") =====
  let openInfo = '(niciun curs facultativ cu preț → fără sesiune OPEN)'
  // preferăm un curs facultativ cu preț/ședință > 0 (hold_loc_open respinge preț 0)
  const { data: cursFac } = await svc.from('cursuri')
    .select('id, numele, pret_sedinta').eq('facultativ', true).gt('pret_sedinta', 0)
    .order('pret_sedinta', { ascending: false }).limit(1).maybeSingle()
  if (cursFac) {
    const future = new Date(now); future.setDate(future.getDate() + 7)
    const { data: ses } = await svc.from('open_sesiuni')
      .insert({ curs: cursFac.id, data: isoDay(future), capacitate: 2, observatii: 'ZZTEST seed - sesiune de test' })
      .select('id').single()
    openInfo = `${cursFac.numele} pe ${isoDay(future)} (cap 2, preț ${cursFac.pret_sedinta ?? '—'}) ses=${ses.id}`
  }

  return { famId: fam.id, anaId: ana.id, adultId: adult.id, cursNume: curs.numele, curs2Nume: curs2.numele, openInfo }
}

await cleanup()
const r = await seed()
console.log('✓ Fixture portal recreat')
console.log('  FAMILIE →', EMAIL, '/', PWD)
console.log('    ZZTEST Ana: 2 înrolări — rest 80 (' + r.cursNume + ') + rest 150 (' + r.curs2Nume + ') → FIFO total 230')
console.log('    ZZTEST Mihai: fără date')
console.log('  ADULT  →', EMAIL_ADULT, '/', PWD, '— ZZTEST Adult, rest 100 (fără familie)')
console.log('  SESIUNE OPEN:', r.openInfo)
