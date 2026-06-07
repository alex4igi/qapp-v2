// Backfill prețuri cursuri recurente (one-off, 2026-06-07).
//
// Reguli (confirmate de user):
//  * Normalizează pret_sedinta pe TOATE cursurile recurente (facultativ=false):
//      pret_sedinta = round(pret_anual / (nr_zile_pe_saptamana * 35))
//      (2 ședințe/săpt → /70, 1 ședință/săpt → /35)
//  * Repară pret_anual=0: 2 zile → 2600, 1 zi → 1700.
//  * pret_sedinta_reziliere = 50 flat pe toate recurentele.
//  * Șterge cursurile recurente fără înrolări în sezonul curent (junk).
//
// Rulează:
//   node scripts/fix-prices/run.mjs            # dry-run (doar afișează)
//   node scripts/fix-prices/run.mjs --apply    # aplică pe remote
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')
const CUR_SEZON = 'd51bd4be-497b-5701-83d7-f3f23c64511f' // 2025-2026

const env = fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim() : null
}
const URL_ = get('VITE_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const REZILIERE_FLAT = 50

function fixAnual(anual, zile) {
  if (anual && anual > 0) return anual
  if (zile === 2) return 2600
  if (zile === 1) return 1700
  return null
}

async function countEnrollments(cursId) {
  const r = await fetch(
    `${URL_}/rest/v1/enrollments?cursul=eq.${cursId}&sezon_id=eq.${CUR_SEZON}&select=id`,
    { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } },
  )
  return parseInt((r.headers.get('content-range') || '*/0').split('/')[1], 10)
}

async function main() {
  const cursuri = await (
    await fetch(
      `${URL_}/rest/v1/cursuri?facultativ=eq.false&select=id,numele,pret_anual,pret_sedinta,pret_sedinta_reziliere,zile&order=numele`,
      { headers: H },
    )
  ).json()

  const updates = []
  const deletes = []

  for (const c of cursuri) {
    const zile = (c.zile || []).length
    const enr = await countEnrollments(c.id)
    if (enr === 0) {
      deletes.push(c)
      continue
    }
    const anual = fixAnual(c.pret_anual, zile)
    if (!anual || !zile) {
      console.warn(`  ⚠️  SKIP ${c.numele}: nu pot calcula (anual=${c.pret_anual}, zile=${zile})`)
      continue
    }
    const pretSed = Math.round(anual / (zile * 35))
    updates.push({
      id: c.id,
      numele: c.numele,
      pret_anual: anual,
      pret_sedinta: pretSed,
      pret_sedinta_reziliere: REZILIERE_FLAT,
      _old: { anual: c.pret_anual, sed: c.pret_sedinta, rez: c.pret_sedinta_reziliere },
    })
  }

  console.log(`\n=== UPDATE (${updates.length} cursuri) ===`)
  for (const u of updates) {
    console.log(
      `  ${u.numele.padEnd(28)} anual ${u._old.anual}→${u.pret_anual}  sed ${u._old.sed}→${u.pret_sedinta}  rez ${u._old.rez ?? '∅'}→${u.pret_sedinta_reziliere}`,
    )
  }
  console.log(`\n=== DELETE (${deletes.length} cursuri fără înrolări) ===`)
  for (const d of deletes) console.log(`  ${d.numele} (${d.id})`)

  if (!APPLY) {
    console.log('\n[dry-run] Nimic scris. Rulează cu --apply pentru a aplica.')
    return
  }

  for (const u of updates) {
    const r = await fetch(`${URL_}/rest/v1/cursuri?id=eq.${u.id}`, {
      method: 'PATCH',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        pret_anual: u.pret_anual,
        pret_sedinta: u.pret_sedinta,
        pret_sedinta_reziliere: u.pret_sedinta_reziliere,
      }),
    })
    if (!r.ok) console.error(`  ❌ UPDATE ${u.numele}: ${r.status} ${await r.text()}`)
  }
  for (const d of deletes) {
    const r = await fetch(`${URL_}/rest/v1/cursuri?id=eq.${d.id}`, {
      method: 'DELETE',
      headers: { ...H, Prefer: 'return=minimal' },
    })
    if (!r.ok) console.error(`  ❌ DELETE ${d.numele}: ${r.status} ${await r.text()}`)
  }
  console.log('\n✅ Aplicat.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
