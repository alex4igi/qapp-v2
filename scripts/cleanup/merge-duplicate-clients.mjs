// Merge clienți dubli. DRY-RUN implicit (nu scrie nimic). `--apply` execută.
// Per cluster: alege rândul canonic, mută toate datele copil pe el, șterge restul.
// Vezi clusterele în find-duplicate-clients-fuzzy.mjs (aceeași logică, modul comun).
import fs from 'node:fs'
import { sb } from '../migrate/lib.mjs'
import { loadClients, buildClusters, childCounts, pickCanonical, CHILD_FKS } from './dedupe-lib.mjs'

const APPLY = process.argv.includes('--apply')
// tabele unde un conflict de unicitate la mutare e ok să-l rezolvăm ștergând rândul duplicatului
const CONFLICT_FALLBACK_DELETE = new Set(['anunturi_clienti', 'voucher_redemptions', 'email_logs'])

const all = await loadClients()
const clusters = buildClusters(all)
const dupIds = clusters.flatMap((g) => g.map((c) => c.id))
console.log(`Clienți: ${all.length} | clustere dubluri: ${clusters.length} | clienți implicați: ${dupIds.length}`)
console.log('Numărăm datele copil…')
const counts = await childCounts(dupIds)

const plan = clusters.map((g) => {
  const canonical = pickCanonical(g, counts)
  const dups = g.filter((c) => c.id !== canonical.id)
  const moves = {}
  let moveTotal = 0
  for (const [table] of CHILD_FKS) {
    const n = dups.reduce((s, c) => s + (counts.get(c.id)?.[table] || 0), 0)
    if (n) { moves[table] = n; moveTotal += n }
  }
  return { canonical, dups, moves, moveTotal }
})

const fmtC = (c) => `${(c.nume + ' ' + (c.prenume || '')).trim()} [${c.status}] ${c.auth_user_id ? '🔑portal ' : ''}tel:${c.telefon || '-'} email:${c.email || '-'} (${counts.get(c.id)?._total || 0} date)`

// raport plan
const lines = []
lines.push(`# Plan merge dubluri clienți — ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
let totalDelete = 0, totalMove = 0
for (const p of plan) {
  totalDelete += p.dups.length
  totalMove += p.moveTotal
  lines.push(`\n▸ KEEP  ${p.canonical.id.slice(0, 8)}  ${fmtC(p.canonical)}`)
  for (const d of p.dups) lines.push(`  DEL   ${d.id.slice(0, 8)}  ${fmtC(d)}`)
  if (p.moveTotal) lines.push(`  mută: ${Object.entries(p.moves).map(([t, n]) => `${t}=${n}`).join(', ')}`)
}
const reportPath = 'scripts/cleanup/merge-plan.txt'
fs.writeFileSync(reportPath, lines.join('\n'))

console.log(`\n=== PLAN ===`)
console.log(`Rânduri client de șters: ${totalDelete}`)
console.log(`Rânduri copil de mutat pe canonic: ${totalMove}`)
console.log(`Detaliu complet: ${reportPath}`)

if (!APPLY) {
  console.log(`\nDRY-RUN — nimic modificat. Rulează cu --apply pentru execuție.`)
  process.exit(0)
}

// === APPLY ===
console.log(`\n=== APPLY ===`)
// backup rânduri de șters
const { data: backup } = await sb.from('clienti').select('*').in('id', plan.flatMap((p) => p.dups.map((d) => d.id)))
const ts = '20260622'
const bakPath = `scripts/cleanup/_merged_clients_backup_${ts}.json`
fs.writeFileSync(bakPath, JSON.stringify(backup, null, 2))
console.log(`Backup ${backup.length} clienți → ${bakPath}`)

let okClusters = 0, failClusters = 0, deleted = 0
const failed = []
for (const p of plan) {
  const dupIdList = p.dups.map((d) => d.id)
  try {
    for (const [table, col] of CHILD_FKS) {
      if (!p.moves[table]) continue
      const { error } = await sb.from(table).update({ [col]: p.canonical.id }).in(col, dupIdList)
      if (error) {
        if (CONFLICT_FALLBACK_DELETE.has(table)) {
          const { error: e2 } = await sb.from(table).delete().in(col, dupIdList)
          if (e2) throw new Error(`${table}: ${e2.message}`)
        } else throw new Error(`${table}: ${error.message}`)
      }
    }
    // șterge duplicatele
    const { error: delErr, count } = await sb.from('clienti').delete({ count: 'exact' }).in('id', dupIdList)
    if (delErr) throw new Error(`delete clienti: ${delErr.message}`)
    deleted += count ?? dupIdList.length
    okClusters++
  } catch (e) {
    failClusters++
    failed.push({ keep: p.canonical.id, dups: dupIdList, err: String(e.message || e) })
  }
}
console.log(`\nClustere OK: ${okClusters} | eșuate (sărite, fără pierdere): ${failClusters} | clienți șterși: ${deleted}`)
if (failed.length) {
  fs.writeFileSync('scripts/cleanup/merge-failed.json', JSON.stringify(failed, null, 2))
  console.log(`Clustere de revizuit manual → scripts/cleanup/merge-failed.json`)
}
const { count: totalNow } = await sb.from('clienti').select('id', { count: 'exact', head: true })
console.log(`Total clienți acum: ${totalNow}`)
