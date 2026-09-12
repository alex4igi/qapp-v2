// Zerează datoriile pe lunile în care cursantul NU a avut nicio prezență „Prezent",
// deși grupa a avut ședințe logate în acea lună (decizie Alex, 2026-09-12:
// „luna fără prezență nu e datorie"). Aceeași regulă ca bucket-ul FANTOMĂ din
// audit_reziliate_datorii.mjs, dar aplicată și pe înrolările NEreziliate.
//
// Garduri: doar luni COMPLET încheiate (nu luna curentă — la început de sezon
// nimeni n-are încă prezențe) și doar dacă grupa are cel puțin o prezență logată
// în acea lună (altfel absența datelor nu dovedește nimic).
//
//   node scripts/cleanup/zero-luni-fara-prezenta.mjs            # dry-run + raport
//   node scripts/cleanup/zero-luni-fara-prezenta.mjs --apply    # scrie (backup JSON + audit_log)

import { writeFileSync } from 'fs'
import { sb } from '../migrate/lib.mjs'

const APPLY = process.argv.includes('--apply')
const all = async (build) => {
  const out = []
  let f = 0
  for (;;) {
    const { data, error } = await build().range(f, f + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
    f += 1000
  }
  return out
}

const today = new Date().toISOString().slice(0, 10)
const eomPrev = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, 0)).toISOString().slice(0, 10)

const enr = await all(() => sb.from('enrollments').select('id,client,cursul,suma,suma_baza,data_incepere,data_final,reziliat').order('id'))
const inc = await all(() => sb.from('incasari').select('inregistrare,suma').not('inregistrare', 'is', null).order('id'))
const prez = await all(() => sb.from('prezente').select('enrollment,data,status').order('id'))

const META = Object.fromEntries(enr.map((e) => [e.id, e]))
const paid = {}
for (const i of inc) paid[i.inregistrare] = (paid[i.inregistrare] ?? 0) + Number(i.suma || 0)

const prezEnr = new Set()
const sesiuni = new Set()
for (const p of prez) {
  if (p.status !== 'Prezent') continue
  prezEnr.add(p.enrollment)
  const m = META[p.enrollment]
  if (m) sesiuni.add(m.cursul + '|' + (p.data ?? '').slice(0, 7))
}

const luna = (e) => e.data_incepere.slice(0, 7)
const finalLunii = (e) =>
  e.data_final ?? new Date(Date.UTC(+e.data_incepere.slice(0, 4), +e.data_incepere.slice(5, 7), 0)).toISOString().slice(0, 10)

const tinte = enr.filter(
  (e) =>
    !e.reziliat &&
    Number(e.suma || 0) > 0 &&
    Number(e.suma || 0) - (paid[e.id] ?? 0) > 0.005 &&
    finalLunii(e) <= eomPrev &&
    !prezEnr.has(e.id) &&
    sesiuni.has(e.cursul + '|' + luna(e)),
)

const lei = Math.round(tinte.reduce((a, e) => a + Number(e.suma) - (paid[e.id] ?? 0), 0))
console.log(`${tinte.length} înrolări · ${lei} lei · ${new Set(tinte.map((e) => e.client)).size} clienți`)
if (!APPLY) {
  console.log('(dry-run — nimic scris)')
  process.exit(0)
}

const backup = `scripts/cleanup/_backup_zero_fara_prezenta_${today.replace(/-/g, '')}.json`
writeFileSync(
  backup,
  JSON.stringify(
    tinte.map((e) => ({
      id: e.id,
      client: e.client,
      cursul: e.cursul,
      data_incepere: e.data_incepere,
      suma: e.suma,
      suma_baza: e.suma_baza,
      rest: Number(e.suma) - (paid[e.id] ?? 0),
    })),
    null,
    1,
  ),
)
console.log('backup →', backup)

const REASON = 'lună fără nicio prezență, grupa a avut ședințe — nu se facturează (decizie 2026-09-12)'
for (let k = 0; k < tinte.length; k += 100) {
  const lot = tinte.slice(k, k + 100)
  const { error } = await sb.from('enrollments').update({ suma: 0, suma_baza: 0 }).in('id', lot.map((e) => e.id))
  if (error) throw error
  const { error: aErr } = await sb.from('audit_log').insert(
    lot.map((e) => ({
      entity_type: 'enrollment',
      entity_id: e.id,
      action: 'price_override',
      actor_role: 'owner',
      reason: REASON,
      old_value: { suma: e.suma, suma_baza: e.suma_baza },
      new_value: { suma: 0, suma_baza: 0 },
    })),
  )
  if (aErr) throw aErr
  console.log(`  ${Math.min(k + 100, tinte.length)}/${tinte.length}`)
}

const check = await sb.from('enrollments').select('id,suma,suma_baza').in('id', tinte.slice(0, 100).map((e) => e.id))
console.log('verificare:', (check.data ?? []).filter((r) => Number(r.suma) !== 0 || Number(r.suma_baza) !== 0).length, 'rânduri nezerate')
process.exit(0)
