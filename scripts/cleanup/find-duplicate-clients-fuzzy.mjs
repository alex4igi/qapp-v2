// READ-ONLY: raport dubluri clienți (logică în dedupe-lib.mjs, partajată cu merge-ul).
import { loadClients, buildClusters, normEmail } from './dedupe-lib.mjs'

const all = await loadClients()
const clusters = buildClusters(all)

const fmt = (c) =>
  `${c.nume} ${c.prenume || ''}`.trim() +
  ` [${c.status || '?'}]${c.auth_user_id ? ' 🔑' : ''} tel:${c.telefon || '-'}${c.telefonul_2 ? '/' + c.telefonul_2 : ''} email:${c.email || '-'} fam:${c.familia ? c.familia.slice(0, 8) : '-'} n:${(c.data_nasterii || '').slice(0, 10) || '-'}`

const redundant = clusters.reduce((s, g) => s + g.length - 1, 0)
console.log(`Clienți totali: ${all.length}`)
console.log(`🔴 Clustere dubluri: ${clusters.length} | clienți implicați: ${clusters.reduce((s, g) => s + g.length, 0)} | rânduri redundante: ${redundant}\n`)
for (const g of clusters) {
  console.log(`▸ (${g.length}) ${(g[0].nume + ' ' + (g[0].prenume || '')).trim()}`)
  for (const c of g) console.log(`      ${c.id.slice(0, 8)}  ${fmt(c)}`)
}
