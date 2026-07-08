// Merge teacheri dubli. DRY-RUN implicit (nu scrie nimic). `--apply` execută.
// Per cluster: alege rândul canonic, mută toate datele copil pe el, șterge restul.
// Vezi clusterele în find-duplicate-teacheri.mjs (aceeași logică, modul comun).
import fs from 'node:fs'
import { sb } from '../migrate/lib.mjs'
import { loadTeacheri, buildClusters, childCounts, pickCanonical, TEACHER_CHILD_FKS } from './dedupe-teacheri-lib.mjs'

const APPLY = process.argv.includes('--apply')
// tabele unde un conflict de unicitate la mutare e ok să-l rezolvăm ștergând rândul duplicatului
// (snapshot lunar redundant cu al canonicului pe aceeași lună/curs)
const CONFLICT_FALLBACK_DELETE = new Set(['salarii_teacher', 'evaluari_teacher', 'cursuri_teacheri'])

const all = await loadTeacheri()
const clusters = buildClusters(all)
const dupIds = clusters.flatMap((g) => g.map((c) => c.id))
console.log(`Teacheri: ${all.length} | clustere dubluri: ${clusters.length} | teacheri implicați: ${dupIds.length}`)
if (!clusters.length) { console.log('✅ Niciun duplicat — nimic de făcut.'); process.exit(0) }
console.log('Numărăm datele copil…')
const counts = await childCounts(dupIds)

const plan = clusters.map((g) => {
  const canonical = pickCanonical(g, counts)
  const dups = g.filter((c) => c.id !== canonical.id)
  const moves = {}
  let moveTotal = 0
  for (const [table] of TEACHER_CHILD_FKS) {
    const n = dups.reduce((s, c) => s + (counts.get(c.id)?.[table] || 0), 0)
    if (n) { moves[table] = n; moveTotal += n }
  }
  // cont login de mutat pe canonic? (doar dacă canonicul n-are și un singur duplicat are)
  const dupsWithAuth = dups.filter((c) => c.auth_user_id)
  const authMove = !canonical.auth_user_id && dupsWithAuth.length === 1 ? dupsWithAuth[0] : null
  const authConflict = canonical.auth_user_id ? dupsWithAuth : (dupsWithAuth.length > 1 ? dupsWithAuth : [])
  return { canonical, dups, moves, moveTotal, authMove, authConflict }
})

const fmtT = (c) => `${(c.nume + ' ' + (c.prenume || '')).trim()}${c.arhivat ? ' [arhivat]' : ''} ${c.auth_user_id ? '🔑login ' : ''}tel:${c.telefon || '-'} email:${c.email || '-'} old:${c.old_teacher_id ?? '-'} (${counts.get(c.id)?._total || 0} date)`

// raport plan
const lines = []
lines.push(`# Plan merge dubluri teacheri — ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
let totalDelete = 0, totalMove = 0
for (const p of plan) {
  totalDelete += p.dups.length
  totalMove += p.moveTotal
  lines.push(`\n▸ KEEP  ${p.canonical.id.slice(0, 8)}  ${fmtT(p.canonical)}`)
  for (const d of p.dups) lines.push(`  DEL   ${d.id.slice(0, 8)}  ${fmtT(d)}`)
  if (p.moveTotal) lines.push(`  mută: ${Object.entries(p.moves).map(([t, n]) => `${t}=${n}`).join(', ')}`)
  if (p.authMove) lines.push(`  🔑 mut cont login de la ${p.authMove.id.slice(0, 8)} pe canonic`)
  if (p.authConflict.length) lines.push(`  ⚠️ conflict cont login (canonic+duplicat au login) — raportat, NU se atinge`)
}
const reportPath = 'scripts/cleanup/merge-teacheri-plan.txt'
fs.writeFileSync(reportPath, lines.join('\n'))

console.log(`\n=== PLAN ===`)
console.log(`Rânduri teacher de șters: ${totalDelete}`)
console.log(`Rânduri copil de mutat pe canonic: ${totalMove}`)
console.log(`Detaliu complet: ${reportPath}`)

if (!APPLY) {
  console.log(`\nDRY-RUN — nimic modificat. Rulează cu --apply pentru execuție.`)
  process.exit(0)
}

// === APPLY ===
console.log(`\n=== APPLY ===`)
// backup rânduri de șters
const allDupIds = plan.flatMap((p) => p.dups.map((d) => d.id))
const { data: backup } = await sb.from('teacheri').select('*').in('id', allDupIds)
const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '')
const bakPath = `scripts/cleanup/_merged_teacheri_backup_${ts}.json`
fs.writeFileSync(bakPath, JSON.stringify(backup, null, 2))
console.log(`Backup ${backup?.length ?? 0} teacheri → ${bakPath}`)

let okClusters = 0, failClusters = 0, deleted = 0
const failed = []
const authConflicts = []
for (const p of plan) {
  const dupIdList = p.dups.map((d) => d.id)
  try {
    // 1. cont login: mută pe canonic dacă e cazul (golește întâi duplicatul — index unic)
    if (p.authMove) {
      const uid = p.authMove.auth_user_id
      let { error } = await sb.from('teacheri').update({ auth_user_id: null }).eq('id', p.authMove.id)
      if (error) throw new Error(`auth clear dup: ${error.message}`)
      ;({ error } = await sb.from('teacheri').update({ auth_user_id: uid }).eq('id', p.canonical.id))
      if (error) throw new Error(`auth set canonic: ${error.message}`)
    }
    if (p.authConflict.length) authConflicts.push({ keep: p.canonical.id, conflict: p.authConflict.map((c) => ({ id: c.id, auth_user_id: c.auth_user_id })) })

    // 2. reasignează datele copil
    for (const [table, col] of TEACHER_CHILD_FKS) {
      if (!p.moves[table]) continue
      const { error } = await sb.from(table).update({ [col]: p.canonical.id }).in(col, dupIdList)
      if (error) {
        if (CONFLICT_FALLBACK_DELETE.has(table)) {
          // mută ce se poate individual; coliziunile pe unique le ștergem
          const { data: rows } = await sb.from(table).select('*').in(col, dupIdList)
          for (const r of rows || []) {
            const { error: eUp } = await sb.from(table).update({ [col]: p.canonical.id }).eq(col, r[col]).match(pkMatch(table, r))
            if (eUp) {
              const { error: eDel } = await sb.from(table).delete().match(pkMatch(table, r))
              if (eDel) throw new Error(`${table} (fallback): ${eDel.message}`)
            }
          }
        } else throw new Error(`${table}: ${error.message}`)
      }
    }
    // 3. șterge duplicatele
    const { error: delErr, count } = await sb.from('teacheri').delete({ count: 'exact' }).in('id', dupIdList)
    if (delErr) throw new Error(`delete teacheri: ${delErr.message}`)
    deleted += count ?? dupIdList.length
    okClusters++
  } catch (e) {
    failClusters++
    failed.push({ keep: p.canonical.id, dups: dupIdList, err: String(e.message || e) })
  }
}

console.log(`\nClustere OK: ${okClusters} | eșuate (sărite, fără pierdere): ${failClusters} | teacheri șterși: ${deleted}`)
if (authConflicts.length) {
  fs.writeFileSync('scripts/cleanup/merge-teacheri-conflicte-auth.json', JSON.stringify(authConflicts, null, 2))
  console.log(`Conflicte cont login (decizie manuală) → scripts/cleanup/merge-teacheri-conflicte-auth.json`)
}
if (failed.length) {
  fs.writeFileSync('scripts/cleanup/merge-teacheri-failed.json', JSON.stringify(failed, null, 2))
  console.log(`Clustere de revizuit manual → scripts/cleanup/merge-teacheri-failed.json`)
}
const { count: totalNow } = await sb.from('teacheri').select('id', { count: 'exact', head: true })
console.log(`Total teacheri acum: ${totalNow}`)

// cheia primară per tabel, pentru update/delete individual la fallback pe conflict unique
function pkMatch(table, row) {
  if (table === 'cursuri_teacheri') return { curs_id: row.curs_id, teacher_id: row.teacher_id }
  return { id: row.id }
}
