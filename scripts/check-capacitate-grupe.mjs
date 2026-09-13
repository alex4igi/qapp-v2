// Verifică standardizarea mărimii grupelor.
//
// `cursuri.capacitate_maxima` e numitorul KPI-ului de ocupare din grila de
// salarizare, iar sumele de bonus sunt scrise în grilă exact pe treptele
// 10/15/20/25/30 (docs/grila-salarizare-instructori.md §2). O capacitate în
// afara treptelor plătește o ocupare identică altfel decât grupa de lângă, iar
// una care nu e a sălii rupe comparația între grupele din aceeași sală.
//
// Raportează:
//  1. capacități în afara treptelor (pe cursurile cu sală) — EROARE, e drift
//  2. săli fără capacitate standard setată — EROARE
//  3. capacități care diferă de standardul sălii — doar informativ: există
//     excepții voite (`S Open Class` stă pe 30 în SCM Studio 1, unde standardul e 25,
//     fiindcă la open class capacitatea e limita unei ședințe, nu mărimea grupei)
// Cursurile fără sală ȘI fără locație sunt moloz din v1 (fără înrolări active);
// se listează doar la numărătoare, nu ca eroare.
//
// Rulare:  node scripts/check-capacitate-grupe.mjs
// Exit 0 = curat; exit 1 = există abateri (listate).

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const TREPTE = [10, 15, 20, 25, 30]

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: sali, error: eSali } = await db
  .from('sali')
  .select('id, nume, capacitate')
if (eSali) throw eSali
const { data: cursuri, error: eCursuri } = await db
  .from('cursuri')
  .select('id, numele, sezon, sala, locatie, capacitate_maxima')
if (eCursuri) throw eCursuri

const salaById = new Map(sali.map((s) => [s.id, s]))

const saliFaraStandard = sali.filter((s) => !TREPTE.includes(s.capacitate ?? 0))
const cuSala = cursuri.filter((c) => c.sala)
const inAfaraTreptelor = cuSala.filter((c) => !TREPTE.includes(c.capacitate_maxima ?? 0))
const diferaDeSala = cuSala.filter((c) => {
  const std = salaById.get(c.sala)?.capacitate
  return std && TREPTE.includes(std) && c.capacitate_maxima !== std
})
const orfane = cursuri.filter((c) => !c.sala && !c.locatie)

let probleme = 0

if (saliFaraStandard.length) {
  probleme += saliFaraStandard.length
  console.log(`\n⚠️  ${saliFaraStandard.length} săli fără capacitate standard (trepte ${TREPTE.join('/')}):`)
  for (const s of saliFaraStandard) console.log(`   ${s.nume}: ${s.capacitate ?? 'null'}`)
}

if (inAfaraTreptelor.length) {
  probleme += inAfaraTreptelor.length
  console.log(`\n⚠️  ${inAfaraTreptelor.length} cursuri cu capacitate în afara treptelor:`)
  for (const c of inAfaraTreptelor)
    console.log(`   ${salaById.get(c.sala)?.nume ?? '?'} · ${c.numele}: ${c.capacitate_maxima ?? 'null'}`)
}

// Informativ, nu eroare: o abatere pe o treaptă validă e o decizie, nu drift.
if (diferaDeSala.length) {
  console.log(`\nℹ️  ${diferaDeSala.length} cursuri cu capacitate diferită de standardul sălii (verifică dacă e voit):`)
  for (const c of diferaDeSala)
    console.log(
      `   ${salaById.get(c.sala)?.nume ?? '?'} (std ${salaById.get(c.sala)?.capacitate}) · ${c.numele}: ${c.capacitate_maxima}`,
    )
}

console.log(
  `\n${probleme === 0 ? '✅' : '❌'} ${cuSala.length} cursuri cu sală verificate · ` +
    `${orfane.length} fără sală și fără locație (moloz v1, ignorate) · ${probleme} abateri · ` +
    `${diferaDeSala.length} excepții față de standardul sălii`,
)
process.exit(probleme === 0 ? 0 : 1)
