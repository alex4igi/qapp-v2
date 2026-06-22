// READ-ONLY: găsește potențiali clienți dubli.
// Semnal de încredere = ACELAȘI NUME + (telefon real SAU email real).
// Telefon singur e înșelător (placeholder 0700000000 etc. partajat de zeci de nume diferite).
import { sb } from '../migrate/lib.mjs'

let all = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('clienti')
    .select('id,nume,prenume,telefon,telefonul_2,email,status,familia,created')
    .range(from, from + 999)
  if (error) throw error
  all = all.concat(data)
  if (data.length < 1000) break
}
console.log(`Clienți totali: ${all.length}`)

const normPhone = (p) => {
  if (!p) return null
  let d = String(p).replace(/\D/g, '')
  if (d.startsWith('40')) d = d.slice(2)
  d = d.replace(/^0+/, '')
  return d.length >= 9 ? d.slice(-9) : null // doar telefoane plauzibile (9 cifre)
}
const normEmail = (e) => {
  if (!e) return null
  const v = String(e).trim().toLowerCase()
  return /.+@.+\..+/.test(v) ? v : null
}
const normName = (c) =>
  `${c.nume || ''} ${c.prenume || ''}`.trim().toLowerCase().replace(/\s+/g, ' ') || null

// --- placeholder = aceeași valoare la >5 nume DIFERITE → non-discriminantă ---
const phoneNames = new Map()
const emailNames = new Map()
for (const c of all) {
  const nm = normName(c)
  for (const p of [normPhone(c.telefon), normPhone(c.telefonul_2)]) {
    if (!p) continue
    if (!phoneNames.has(p)) phoneNames.set(p, new Set())
    phoneNames.get(p).add(nm)
  }
  const e = normEmail(c.email)
  if (e) {
    if (!emailNames.has(e)) emailNames.set(e, new Set())
    emailNames.get(e).add(nm)
  }
}
const placeholderPhones = new Set([...phoneNames].filter(([, s]) => s.size > 5).map(([k]) => k))
const placeholderEmails = new Set([...emailNames].filter(([, s]) => s.size > 5).map(([k]) => k))
console.log(`\nTelefoane placeholder (ignorate, partajate de >5 nume): ${placeholderPhones.size}`)
console.log('  ' + [...placeholderPhones].slice(0, 10).join(', '))
console.log(`Email-uri placeholder (ignorate): ${placeholderEmails.size}`)
if (placeholderEmails.size) console.log('  ' + [...placeholderEmails].slice(0, 10).join(', '))

// --- grupare ---
const groupBy = (keyFn) => {
  const m = new Map()
  for (const c of all) {
    const k = keyFn(c)
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(c)
  }
  return [...m.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length)
}

const phoneKeys = (c) =>
  [normPhone(c.telefon), normPhone(c.telefonul_2)].filter((p) => p && !placeholderPhones.has(p))

// HIGH: nume + telefon real
const namePhone = groupBy((c) => {
  const p = phoneKeys(c)[0]
  const nm = normName(c)
  return p && nm ? `${nm}|${p}` : null
})
// HIGH: nume + email real
const nameEmail = groupBy((c) => {
  const e = normEmail(c.email)
  const nm = normName(c)
  return e && !placeholderEmails.has(e) && nm ? `${nm}|${e}` : null
})
// MED: email real partajat (poate familie, dar nume diferite → nu e dublu)
const emailOnly = groupBy((c) => {
  const e = normEmail(c.email)
  return e && !placeholderEmails.has(e) ? e : null
})
// WEAK: doar nume identic (pot fi omonimi)
const nameOnly = groupBy(normName)

const fmt = (c) =>
  `${c.nume} ${c.prenume || ''}`.trim() +
  ` [${c.status || '?'}] tel:${c.telefon || '-'}${c.telefonul_2 ? '/' + c.telefonul_2 : ''} email:${c.email || '-'} fam:${c.familia ? c.familia.slice(0, 8) : '-'}`

const report = (title, groups, max) => {
  const n = groups.reduce((s, [, v]) => s + v.length, 0)
  console.log(`\n========== ${title} ==========`)
  console.log(`Grupuri: ${groups.length} | clienți implicați: ${n}`)
  for (const [k, v] of groups.slice(0, max)) {
    console.log(`\n  ▸ (${v.length}) ${k}`)
    for (const c of v) console.log(`      ${c.id.slice(0, 8)}  ${fmt(c)}`)
  }
  if (groups.length > max) console.log(`\n  … încă ${groups.length - max} grupuri`)
}

report('🔴 NUME + TELEFON identic (dubluri quasi-sigure)', namePhone, 40)
report('🔴 NUME + EMAIL identic (dubluri quasi-sigure)', nameEmail, 20)
report('🟡 EMAIL real partajat (verifică: familie vs dublu)', emailOnly, 10)

console.log('\n\n=== SUMAR ===')
console.log(`🔴 nume+telefon: ${namePhone.length} grupuri, ${namePhone.reduce((s, [, v]) => s + v.length, 0)} clienți`)
console.log(`🔴 nume+email:   ${nameEmail.length} grupuri, ${nameEmail.reduce((s, [, v]) => s + v.length, 0)} clienți`)
console.log(`🟡 email partajat: ${emailOnly.length} grupuri`)
console.log(`⚪ nume identic (incl. omonimi posibili): ${nameOnly.length} grupuri, ${nameOnly.reduce((s, [, v]) => s + v.length, 0)} clienți`)
