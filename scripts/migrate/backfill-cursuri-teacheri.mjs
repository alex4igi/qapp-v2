// Backfill IDEMPOTENT: populează cursuri_teacheri (M:N) din titularul legacy
// cursuri.teacher. Necesar pentru ca profesorii logați să-și vadă grupele
// (UI-ul citește din M:N, nu din cursuri.teacher).
//
// De ce re-rulabil: la fiecare re-import din v1, wipe() șterge `cursuri`
// (cascade golește și cursuri_teacheri) → M:N rămâne gol. Acest pas se cheamă
// automat la finalul import.mjs și poate fi rulat și manual:
//
//   node scripts/migrate/backfill-cursuri-teacheri.mjs
//
// Idempotent: ON CONFLICT (curs_id, teacher_id) DO NOTHING — nu suprascrie
// legături existente (ex: asistent setat manual din formularul de curs).
import { pathToFileURL } from 'node:url'
import { sb } from './lib.mjs'

export async function backfillCursuriTeacheri() {
  // citește toate cursurile cu titular (paginate, pot fi >1000)
  const cursuri = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('cursuri').select('id, teacher').not('teacher', 'is', null)
      .range(from, from + 999)
    if (error) throw new Error(`citire cursuri: ${error.message}`)
    cursuri.push(...data)
    if (data.length < 1000) break
  }

  const rows = cursuri.map((c) => ({ curs_id: c.id, teacher_id: c.teacher, rol: 'titular' }))
  let inserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await sb
      .from('cursuri_teacheri')
      .upsert(chunk, { onConflict: 'curs_id,teacher_id', ignoreDuplicates: true })
    if (error) throw new Error(`upsert cursuri_teacheri: ${error.message}`)
    inserted += chunk.length
  }
  return { courses: rows.length }
}

// rulare standalone (pathToFileURL encodează spațiile din cale ca import.meta.url)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  backfillCursuriTeacheri()
    .then(({ courses }) => { console.log(`✅ backfill cursuri_teacheri: ${courses} legături titular procesate`); process.exit(0) })
    .catch((e) => { console.error(e); process.exit(1) })
}
