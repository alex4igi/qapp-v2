// Logică partajată de deduplicare clienți (folosită de raport ȘI de merge,
// ca să opereze pe EXACT aceleași clustere).
import { sb } from '../migrate/lib.mjs'

// Toate FK-urile către clienti(id) — autoritar din src/types/database.ts (schema remote).
export const CHILD_FKS = [
  ['enrollments', 'client'],
  ['incasari', 'client'],
  ['prezente', 'client'],
  ['feedback', 'autor'],
  ['vouchere', 'client'],
  ['leads', 'id_client'],
  ['evaluari', 'client'],
  ['documente_client', 'client'],
  ['motivari_absenta', 'client'],
  ['open_rezervari', 'client'],
  ['voucher_redemptions', 'client'],
  ['anunturi_clienti', 'client_id'],
  ['client_contacte', 'client_id'],
  ['email_logs', 'client_id'],
  ['netopia_orders', 'client_id'],
  ['reinscrieri_gate', 'client_id'],
]

export async function loadClients() {
  let all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('clienti')
      .select('id,nume,prenume,telefon,telefonul_2,email,status,familia,auth_user_id,data_nasterii,created')
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

export function buildClusters(all) {
  // placeholdere = valoare la >5 nume diferite
  const pNames = new Map(), eNames = new Map()
  const addN = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v) }
  for (const c of all) {
    const n = nameCanon(c)
    for (const p of [normPhone(c.telefon), normPhone(c.telefonul_2)]) if (p) addN(pNames, p, n)
    const e = normEmail(c.email); if (e) addN(eNames, e, n)
  }
  const phPlaceholder = new Set([...pNames].filter(([, s]) => s.size > 5).map(([k]) => k))
  const emPlaceholder = new Set([...eNames].filter(([, s]) => s.size > 5).map(([k]) => k))

  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  for (const c of all) parent.set(c.id, c.id)
  const byKey = new Map()
  const addKey = (k, c) => { if (!k) return; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(c) }
  for (const c of all) {
    for (const p of [normPhone(c.telefon), normPhone(c.telefonul_2)]) if (p && !phPlaceholder.has(p)) addKey('p:' + p, c)
    const e = normEmail(c.email); if (e && !emPlaceholder.has(e)) addKey('e:' + e, c)
  }
  for (const [, members] of byKey) for (let i = 1; i < members.length; i++) parent.set(find(members[0].id), find(members[i].id))

  const comps = new Map()
  for (const c of all) { const r = find(c.id); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(c) }

  const dupClusters = []
  for (const [, members] of comps) {
    if (members.length < 2) continue
    const sp = new Map(); members.forEach((c) => sp.set(c.id, c.id))
    const sfind = (x) => { while (sp.get(x) !== x) { sp.set(x, sp.get(sp.get(x))); x = sp.get(x) } return x }
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        if (nameSim(nameCanon(members[i]), nameCanon(members[j])) >= SIM)
          sp.set(sfind(members[i].id), sfind(members[j].id))
    const sub = new Map()
    for (const c of members) { const r = sfind(c.id); if (!sub.has(r)) sub.set(r, []); sub.get(r).push(c) }
    for (const g of sub.values()) if (g.length > 1) dupClusters.push(g)
  }
  dupClusters.sort((a, b) => b.length - a.length)
  return dupClusters
}

// Câte rânduri copil are fiecare client (pe toate tabelele) — pentru scor canonic + raport.
export async function childCounts(clientIds) {
  const counts = new Map() // clientId -> { table -> n, _total }
  const ensure = (id) => { if (!counts.has(id)) counts.set(id, { _total: 0 }); return counts.get(id) }
  clientIds.forEach(ensure)
  for (const [table, col] of CHILD_FKS) {
    for (let i = 0; i < clientIds.length; i += 100) {
      const chunk = clientIds.slice(i, i + 100)
      const { data, error } = await sb.from(table).select(col).in(col, chunk)
      if (error) { if (/does not exist|schema cache/i.test(error.message)) break; throw error }
      for (const row of data) {
        const id = row[col]; const e = ensure(id)
        e[table] = (e[table] || 0) + 1; e._total++
      }
    }
  }
  return counts
}

// Alege rândul canonic: cont portal > Activ > mai multe date copil > are email/familie/dob valid > cel mai vechi.
export function pickCanonical(cluster, counts) {
  const bogusDob = (d) => !d || d < '1990-01-01' || d.startsWith('1899') || d.startsWith('1969')
  const score = (c) => {
    const cc = counts.get(c.id)?._total || 0
    return (
      (c.auth_user_id ? 1e9 : 0) +
      (c.status === 'Activ' ? 1e6 : c.status === 'Inactiv' ? 1e3 : 0) +
      cc * 100 +
      (normEmail(c.email) ? 30 : 0) +
      (c.familia ? 20 : 0) +
      (!bogusDob(c.data_nasterii) ? 10 : 0)
    )
  }
  return [...cluster].sort((a, b) => score(b) - score(a) || (a.created < b.created ? -1 : 1))[0]
}

export { normEmail }
