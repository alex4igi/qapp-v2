// ============================================================================
// Curățenie: închide înrolările "fantomă" (orfane la nivel de curs).
// ============================================================================
//
// CONTEXT (de ce există scriptul)
// --------------------------------
// Rosterul grupei (src/features/dashboard/api/grupa.ts) afișează apartenența ca
// înrolare NEreziliată care acoperă luna curentă (`reziliat=false` + data_incepere
// <= sfârșit lună + (data_final null sau >= început lună)). NU folosește `activ`,
// pentru că la datele migrate din v1 `activ` e nesigur.
//
// Problema: o serie de înrolări lunare migrate din v1 are adesea `data_final=null`,
// deci rândurile "acoperă" orice lună la nesfârșit. Un cursant care a PLECAT (sau a
// fost mutat la altă grupă) rămâne fantomă în rosterul grupei vechi, fiindcă vechile
// lui rânduri sunt `reziliat=false` cu `data_final=null`.
// Ex. real: Arsene Arina (mutată S LMi Junior INC → INT) apărea încă la INC.
//
// CE FACE
// -------
// 1. Ia înrolările DESCHISE (reziliat=false) de pe cursuri RECURENTE
//    (facultativ=false) care ACOPERĂ luna curentă (i.e. cele care produc fantome).
// 2. Le grupează pe (client × curs).
// 3. Pentru fiecare pereche verifică ULTIMA prezență `Prezent` pe ACEL curs (peste
//    TOATE înrolările clientului la curs — prezențele stau pe rândul fiecărei luni).
//    Dacă nu există prezență în ultimele `--days` zile (implicit 45) → ORFAN.
// 4. GARDĂ: dacă orfanul are restanță > 0 pe vreun rând deschis → îl SARE și-l
//    raportează (nu vrem să ascundem o datorie reală). Altfel:
// 5. Închide seria pe curs: `reziliat=true, activ=false` pe rândurile deschise.
//
// DE CE reziliat=true (cu gardă de restanță) ȘI NU doar data_final/activ
// ----------------------------------------------------------------------
// - Rosterul filtrează pe `reziliat`, deci `reziliat=true` scoate fantoma în orice
//   formă (inclusiv rânduri din luna curentă sau "Per ședință", pe care mărginirea
//   `data_final` nu le-ar putea scoate).
// - `activ=false` singur NU mai are efect (rosterul nu citește `activ`).
// - View-urile financiare (restante_*, plati_inrolari) filtrează `reziliat=false`,
//   deci reziliat ar ascunde o eventuală datorie → de aceea GARDA pe restanță>0.
//   La rest=0, reziliat nu schimbă nimic financiar (incasari rămân intacte).
//
// UTILIZARE
// ---------
//   node scripts/cleanup/close_orphan_enrollments.mjs            # dry-run (raport)
//   node scripts/cleanup/close_orphan_enrollments.mjs --apply    # aplică
//   node scripts/cleanup/close_orphan_enrollments.mjs --days=60  # alt prag
//
// IDEMPOTENT: re-rulabil oricând (ex. după un nou import v1). A doua rulare nu mai
// găsește nimic dacă datele sunt deja curate.
// ============================================================================

import { sb } from '../migrate/lib.mjs'

const APPLY = process.argv.includes('--apply')
const daysArg = process.argv.find((a) => a.startsWith('--days='))
const THRESHOLD_DAYS = daysArg ? Number(daysArg.split('=')[1]) : 45

function iso(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
}
const now = new Date()
const TODAY = iso(now)
const MONTH_START = TODAY.slice(0, 7) + '-01'
const MONTH_END = (() => {
  const [y, m] = MONTH_START.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
})()
const CUTOFF = iso(new Date(now.getTime() - THRESHOLD_DAYS * 86_400_000))

console.log(`\n=== Curățenie înrolări orfane ===`)
console.log(`Azi: ${TODAY} | luna: ${MONTH_START}..${MONTH_END} | prag prezență: ${THRESHOLD_DAYS}z (cutoff ${CUTOFF})`)
console.log(`Mod: ${APPLY ? 'APPLY (scrie în DB)' : 'DRY-RUN (doar raport)'}\n`)

// 1. Cursuri recurente
const { data: cursuri, error: cErr } = await sb
  .from('cursuri')
  .select('id, numele, facultativ')
if (cErr) throw cErr
const cMap = new Map(cursuri.map((c) => [c.id, c]))

// 2. Înrolări deschise care acoperă luna curentă (cu paginare)
let from = 0
const open = []
for (;;) {
  const { data, error } = await sb
    .from('enrollments')
    .select('id, client, cursul, data_incepere, data_final')
    .eq('reziliat', false)
    .lte('data_incepere', MONTH_END)
    .or(`data_final.is.null,data_final.gte.${MONTH_START}`)
    .range(from, from + 999)
  if (error) throw error
  open.push(...data)
  if (data.length < 1000) break
  from += 1000
}
const anchors = open.filter((e) => cMap.get(e.cursul)?.facultativ === false)

// 3. Grupare pe (client × curs)
const pairs = new Map()
for (const a of anchors) {
  const key = `${a.client}|${a.cursul}`
  if (!pairs.has(key)) pairs.set(key, { client: a.client, cursul: a.cursul })
}
console.log(`Înrolări deschise (recurent, acoperă luna): ${anchors.length} | perechi client×curs: ${pairs.size}`)

// Restanța rămasă pe o înrolare = max(0, suma - sum(incasari))
async function restantaInrolare(enrollmentId, suma) {
  const { data: inc } = await sb
    .from('incasari')
    .select('suma')
    .eq('inregistrare', enrollmentId)
  const paid = (inc ?? []).reduce((a, x) => a + Number(x.suma ?? 0), 0)
  return Math.max(0, Number(suma ?? 0) - paid)
}

// 4. Verifică ultima prezență pe curs → orfani; calculează restanța seriei
const orphans = []
for (const { client, cursul } of pairs.values()) {
  const { data: enrs } = await sb
    .from('enrollments')
    .select('id, suma, reziliat')
    .eq('client', client)
    .eq('cursul', cursul)
  const ids = (enrs ?? []).map((e) => e.id)
  let last = null
  if (ids.length) {
    const { data: pz } = await sb
      .from('prezente')
      .select('data')
      .in('enrollment', ids)
      .eq('status', 'Prezent')
      .order('data', { ascending: false })
      .limit(1)
    last = pz?.[0]?.data ?? null
  }
  if (last && last >= CUTOFF) continue // are prezență recentă → nu e orfan

  const openRows = (enrs ?? []).filter((e) => !e.reziliat)
  let restanta = 0
  for (const r of openRows) restanta += await restantaInrolare(r.id, r.suma)
  orphans.push({ client, cursul, last, openCount: openRows.length, restanta })
}

if (orphans.length === 0) {
  console.log(`\n✅ Niciun orfan. Nimic de făcut.`)
  process.exit(0)
}

// Nume clienți pentru raport
const clientIds = [...new Set(orphans.map((o) => o.client))]
const { data: cli } = await sb
  .from('clienti')
  .select('id, nume, prenume')
  .in('id', clientIds)
const nameMap = new Map((cli ?? []).map((c) => [c.id, `${c.nume} ${c.prenume ?? ''}`.trim()]))

const toClose = orphans.filter((o) => o.restanta === 0)
const skipped = orphans.filter((o) => o.restanta > 0)

console.log(`\n--- ${toClose.length} serii orfane DE ÎNCHIS (reziliat=true, activ=false) ---`)
for (const o of toClose) {
  console.log(
    `  • ${nameMap.get(o.client) ?? o.client} — ${cMap.get(o.cursul)?.numele ?? o.cursul} | ultima prezență: ${o.last ?? 'niciodată'} | rânduri: ${o.openCount}`,
  )
}
if (skipped.length) {
  console.log(`\n--- ${skipped.length} serii orfane SĂRITE (au restanță > 0 — verifică manual) ---`)
  for (const o of skipped) {
    console.log(
      `  ⚠️ ${nameMap.get(o.client) ?? o.client} — ${cMap.get(o.cursul)?.numele ?? o.cursul} | ultima prezență: ${o.last ?? 'niciodată'} | restanță: ${o.restanta} RON`,
    )
  }
}

if (!APPLY) {
  console.log(`\nDRY-RUN — nimic scris. Rulează din nou cu --apply pentru a aplica.`)
  process.exit(0)
}

// 5. Aplică: reziliat=true, activ=false pe rândurile deschise ale orfanilor fără restanță
let updated = 0
for (const o of toClose) {
  const { data, error } = await sb
    .from('enrollments')
    .update({
      reziliat: true,
      activ: false,
      data_reziliere: new Date().toISOString(),
      motiv_reziliere: `Curățenie: înrolare orfană (fără prezență de >${THRESHOLD_DAYS} zile)`,
      updated: new Date().toISOString(),
    })
    .eq('client', o.client)
    .eq('cursul', o.cursul)
    .eq('reziliat', false)
    .select('id')
  if (error) {
    console.error(`  ✗ ${nameMap.get(o.client)} / ${cMap.get(o.cursul)?.numele}: ${error.message}`)
    continue
  }
  updated += data?.length ?? 0
}
console.log(`\n✅ APLICAT: ${updated} rânduri închise pe ${toClose.length} serii.`)
if (skipped.length) console.log(`${skipped.length} serii cu restanță au fost sărite (verifică manual).`)
process.exit(0)
