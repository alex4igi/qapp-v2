// Corectează luna înrolărilor „Per luna" datate la ultima zi a lunii (v1) → ziua 1 a lunii următoare (v2).
// Vezi project_bug_luna_inrolari. DRY RUN implicit; scrie doar cu --apply.
import { sb } from './lib.mjs'

const APPLY = process.argv.includes('--apply')

const { data: seasons, error: se } = await sb.from('sezoane').select('id,data_incepere,data_final')
if (se) { console.error(se); process.exit(1) }
const seasonFor = (d) => { const s = seasons.find((s) => d >= s.data_incepere && d <= s.data_final); return s ? s.id : null }
const isLastDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() === d }
const nextFirst = (iso) => { const [y, m] = iso.split('-').map(Number); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return `${ny}-${String(nm).padStart(2, '0')}-01` }

let from = 0, page = 1000, changed = [], scanned = 0
while (true) {
  const { data, error } = await sb.from('enrollments').select('*').eq('tip_plata', 'Per luna').order('id').range(from, from + page - 1)
  if (error) { console.error(error); break }
  if (!data.length) break
  scanned += data.length
  for (const e of data) {
    if (e.data_incepere && isLastDay(e.data_incepere)) {
      const nd = nextFirst(e.data_incepere)
      changed.push({ ...e, data_incepere: nd, sezon_id: seasonFor(nd) })
    }
  }
  from += page
}

console.log(`Per luna scanate: ${scanned} · de corectat (ultima-zi → zi 1 lună următoare): ${changed.length}`)
console.log('Exemple:', changed.slice(0, 6).map((e) => `${e.id.slice(0, 8)}… → ${e.data_incepere}`))

if (!APPLY) { console.log('\n⏸ DRY RUN — rulează cu --apply ca să scrii în DB.'); process.exit(0) }

let ok = 0
for (let i = 0; i < changed.length; i += 500) {
  const { error } = await sb.from('enrollments').upsert(changed.slice(i, i + 500), { onConflict: 'id', defaultToNull: false })
  if (error) console.error('\n', error.message)
  else ok += Math.min(500, changed.length - i)
  process.stdout.write(`\r  ${ok}/${changed.length}`)
}
console.log('\n✅ aplicat')
