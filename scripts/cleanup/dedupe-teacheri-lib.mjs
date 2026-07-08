// Logică partajată de deduplicare TEACHERI (folosită de raport ȘI de merge,
// ca să opereze pe EXACT aceleași clustere). Analog cu dedupe-lib.mjs (clienți).
import { sb } from '../migrate/lib.mjs'

// Toate FK-urile către teacheri(id). Autoritar din delete_teacher_safe
// (migrația 20260623250000) + schema remote (src/types/database.ts).
export const TEACHER_CHILD_FKS = [
  ['cursuri', 'teacher'],
  ['cursuri_teacheri', 'teacher_id'],
  ['salarii_teacher', 'teacher'],
  ['evaluari', 'teacher'],
  ['evaluari_teacher', 'teacher_id'],
  ['evenimente', 'organizator'],
  ['open_sesiuni', 'instructor'],
  ['inchirieri', 'teacher'],
  ['spectacole', 'responsabil'],
]

export async function loadTeacheri() {
  let all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('teacheri')
      .select('id,nume,prenume,telefon,email,auth_user_id,old_teacher_id,arhivat,created')
      .range(from, from + 999)
    if (error) throw error
    all = all.concat(data)
    if (data.length < 1000) break
  }
  return all
}

const normPhone = (p) => {
  if (!p) return null
  let d = String(p).replace(/\D/g, '')
  if (d.startsWith('40')) d = d.slice(2)
  d = d.replace(/^0+/, '')
  return d.length >= 9 ? d.slice(-9) : null
}
const normEmail = (e) => {
  if (!e) return null
  const v = String(e).trim().toLowerCase()
  return /.+@.+\..+/.test(v) ? v : null
}
const tokens = (c) =>
  `${c.nume || ''} ${c.prenume || ''}`
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean)
const nameCanon = (c) => tokens(c).slice().sort().join(' ')

const lev = (a, b) => {
  const m = a.length, n = b.length
  if (!m) return n; if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}
const nameSim = (a, b) => {
  if (!a || !b) return 0
  if (a === b) return 1
  const ta = new Set(a.split(' ')), tb = new Set(b.split(' '))
  const small = ta.size <= tb.size ? ta : tb, big = ta.size <= tb.size ? tb : ta
  if (small.size >= 2 && [...small].every((t) => big.has(t))) return 0.95
  return 1 - lev(a, b) / Math.max(a.length, b.length)
}

const SIM = 0.82

// Clusterizare: union-find pe semnale tari (old_teacher_id, telefon, email) +
// nume canonic identic (doar când sunt >=2 tokeni, ca să nu grupeze omonimi
// cu un singur nume). Apoi sub-clustering pe similaritate de nume.
export function buildClusters(all) {
  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  for (const c of all) parent.set(c.id, c.id)

  const byKey = new Map()
  const addKey = (k, c) => { if (!k) return; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(c) }
  for (const c of all) {
    // old_teacher_id = 0 (sau null) e sentinelul „fără id legacy", NU un semnal de duplicat.
    if (c.old_teacher_id > 0) addKey('o:' + c.old_teacher_id, c)
    const p = normPhone(c.telefon); if (p) addKey('p:' + p, c)
    const e = normEmail(c.email); if (e) addKey('e:' + e, c)
    const nc = nameCanon(c); if (nc && tokens(c).length >= 2) addKey('n:' + nc, c)
  }
  for (const [, members] of byKey)
    for (let i = 1; i < members.length; i++) parent.set(find(members[0].id), find(members[i].id))

  const comps = new Map()
  for (const c of all) { const r = find(c.id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(c) }

  const dupClusters = []
  for (const [, members] of comps) {
    if (members.length < 2) continue
    // sub-cluster pe similaritate de nume (desparte partajări accidentale de telefon)
    const sp = new Map(); members.forEach((c) => sp.set(c.id, c.id))
    const sfind = (x) => { while (sp.get(x) !== x) { sp.set(x, sp.get(sp.get(x))); x = sp.get(x) } return x }
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j]
        // păstrează împreună dacă numele-s similare SAU au același old_teacher_id
        const sameOld = a.old_teacher_id > 0 && a.old_teacher_id === b.old_teacher_id
        if (sameOld || nameSim(nameCanon(a), nameCanon(b)) >= SIM)
          sp.set(sfind(a.id), sfind(b.id))
      }
    const sub = new Map()
    for (const c of members) { const r = sfind(c.id); if (!sub.has(r)) sub.set(r, []); sub.get(r).push(c) }
    for (const g of sub.values()) if (g.length > 1) dupClusters.push(g)
  }
  dupClusters.sort((a, b) => b.length - a.length)
  return dupClusters
}

// Câte rânduri copil are fiecare teacher (pe toate tabelele) — scor canonic + raport.
export async function childCounts(teacherIds) {
  const counts = new Map() // id -> { table -> n, _total }
  const ensure = (id) => { if (!counts.has(id)) counts.set(id, { _total: 0 }); return counts.get(id) }
  teacherIds.forEach(ensure)
  for (const [table, col] of TEACHER_CHILD_FKS) {
    for (let i = 0; i < teacherIds.length; i += 100) {
      const chunk = teacherIds.slice(i, i + 100)
      const { data, error } = await sb.from(table).select(col).in(col, chunk)
      if (error) { if (/does not exist|schema cache/i.test(error.message)) break; throw error }
      for (const row of data) {
        const id = row[col]; if (id == null) continue
        const e = ensure(id); e[table] = (e[table] || 0) + 1; e._total++
      }
    }
  }
  return counts
}

// Canonic: cont login (auth_user_id) > mai multe date copil (pondere pe salarii+cursuri) >
// NU arhivat > cel mai vechi (created).
export function pickCanonical(cluster, counts) {
  const score = (c) => {
    const cc = counts.get(c.id) || {}
    const heavy = (cc.salarii_teacher || 0) + (cc.cursuri || 0)
    return (
      (c.auth_user_id ? 1e9 : 0) +
      (cc._total || 0) * 100 +
      heavy * 50 +
      (c.arhivat ? 0 : 1e3) +
      (normEmail(c.email) ? 30 : 0) +
      (normPhone(c.telefon) ? 20 : 0)
    )
  }
  return [...cluster].sort((a, b) => score(b) - score(a) || (a.created < b.created ? -1 : 1))[0]
}

export { normEmail, normPhone, nameCanon }
