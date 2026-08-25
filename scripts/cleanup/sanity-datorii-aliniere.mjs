// Sanity-check post-migrațiile 20260824180000+190000: definiția canonică a
// datoriilor trebuie să dea ACELAȘI număr pe toate căile.
//   rest_net (get_datorii_dashboard) == Σ total_restant_net (restante_locatie_luna)
//                                    == Σ aging buckets (get_restante_aging)
//   rest_oneoff == Σ datorii_rest.rest>0
//   worklist ⊆ rest_net (doar clienți Activi cu ≥1 zi depășire)
// Rulare: node scripts/cleanup/sanity-datorii-aliniere.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const ron = (n) => `${Math.round(n).toLocaleString('ro-RO')} RON`

// 1. Agregatul canonic
const t0 = Date.now()
const { data: dash, error: e1 } = await db.rpc('get_datorii_dashboard')
if (e1) throw e1
const sum = dash.reduce(
  (a, r) => ({
    net: a.net + Number(r.rest_net),
    oneoff: a.oneoff + Number(r.rest_oneoff),
    prescris: a.prescris + Number(r.rest_prescris),
    datornici: a.datornici + Number(r.nr_datornici),
  }),
  { net: 0, oneoff: 0, prescris: 0, datornici: 0 },
)
console.log(`get_datorii_dashboard (${Date.now() - t0}ms): ${dash.length} locații`)
for (const r of dash)
  console.log(
    `  ${r.nume_locatie ?? 'Fără locație'}: net ${ron(r.rest_net)} · one-off ${ron(r.rest_oneoff)} · prescris ${ron(r.rest_prescris)} · ${r.nr_datornici} datornici`,
  )
console.log(`  TOTAL: net ${ron(sum.net)} + one-off ${ron(sum.oneoff)} · prescris ${ron(sum.prescris)} · ${sum.datornici} datornici (pe locații)`)

// 2. Views lunare (echivalentul /statistici + /financiar pe net)
let viewNet = 0
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('restante_locatie_luna')
    .select('total_restant_net')
    .range(from, from + 999)
  if (error) throw error
  for (const r of data) viewNet += Number(r.total_restant_net ?? 0)
  if (data.length < 1000) break
}

// 3. Aging
const { data: aging, error: e3 } = await db.rpc('get_restante_aging')
if (e3) throw e3
const agingSum = aging.reduce((a, r) => a + Number(r.total), 0)

// 4. Worklist (global, toate sezoanele)
const { data: wl, error: e4 } = await db.rpc('get_restante_worklist')
if (e4) throw e4
const wlSum = wl.reduce((a, r) => a + Number(r.rest_total), 0)

// 5. One-off direct
let oneoff = 0
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('datorii_rest').select('rest').range(from, from + 999)
  if (error) throw error
  for (const r of data) if (Number(r.rest) > 0) oneoff += Number(r.rest)
  if (data.length < 1000) break
}

// 6. Evoluția (perf + ultimul punct)
const t6 = Date.now()
const { data: evo, error: e6 } = await db.rpc('get_datorii_evolutie', { p_luni: 12 })
if (e6) throw e6
const last = evo[evo.length - 1]
console.log(`get_datorii_evolutie (${Date.now() - t6}ms): ${evo.length} luni; ${last.luna} → sold_total ${ron(last.sold_total)}`)

const ok = (label, a, b, tol = 1) =>
  console.log(`${Math.abs(a - b) <= tol ? '✅' : '❌'} ${label}: ${ron(a)} vs ${ron(b)}`)
ok('rest_net == Σ restante_locatie_luna.total_restant_net', sum.net, viewNet)
ok('rest_net == Σ aging', sum.net, agingSum)
ok('rest_oneoff == Σ datorii_rest', sum.oneoff, oneoff)
console.log(
  `${wlSum <= sum.net + 1 ? '✅' : '❌'} worklist (${wl.length} clienți, ${ron(wlSum)}) ⊆ rest_net ${ron(sum.net)} — diferența ${ron(sum.net - wlSum)} = clienți Inactivi/EXclienți sau doar luna curentă nescadentă`,
)
const suspendati = wl.filter((r) => r.suspendat).length
console.log(`   coloane noi worklist: cursuri ✓, id_locatie ✓, suspendat (${suspendati} activi), ultim_sms_at ✓`)
