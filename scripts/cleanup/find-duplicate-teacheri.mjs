// Raport read-only: clustere de teacheri duplicați + KEEP/DEL propus. Nu scrie nimic.
import { loadTeacheri, buildClusters, childCounts, pickCanonical, TEACHER_CHILD_FKS } from './dedupe-teacheri-lib.mjs'

const all = await loadTeacheri()
const clusters = buildClusters(all)
const dupIds = clusters.flatMap((g) => g.map((c) => c.id))
console.log(`Teacheri: ${all.length} | clustere dubluri: ${clusters.length} | teacheri implicați: ${dupIds.length}`)

if (!clusters.length) { console.log('\n✅ Niciun duplicat detectat.'); process.exit(0) }

console.log('Numărăm datele copil…')
const counts = await childCounts(dupIds)

const fmt = (c) => {
  const cc = counts.get(c.id) || {}
  const parts = TEACHER_CHILD_FKS.map(([t]) => cc[t] ? `${t}=${cc[t]}` : null).filter(Boolean)
  const nume = `${(c.nume + ' ' + (c.prenume || '')).trim()}`
  return `${nume}${c.arhivat ? ' [arhivat]' : ''} ${c.auth_user_id ? '🔑login ' : ''}tel:${c.telefon || '-'} email:${c.email || '-'} old:${c.old_teacher_id ?? '-'} (${cc._total || 0} date${parts.length ? ': ' + parts.join(', ') : ''})`
}

for (const g of clusters) {
  const canonical = pickCanonical(g, counts)
  console.log(`\n▸ KEEP  ${canonical.id.slice(0, 8)}  ${fmt(canonical)}`)
  for (const d of g.filter((c) => c.id !== canonical.id)) console.log(`  DEL   ${d.id.slice(0, 8)}  ${fmt(d)}`)
}
console.log('\n(read-only — nimic modificat)')
