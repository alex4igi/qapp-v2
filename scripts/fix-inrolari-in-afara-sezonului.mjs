// Reparație unică (2026-09-12): cele două înrolări cu `data_incepere` în afara
// sezonului lor, invizibile în fișe dar numărate de get_client_restante.
//
//  1. Ana Aluculesă · N K-Pop SD · 1 sept, 280 lei — dublură curată a înrolării
//     corecte din 12 sept (230 lei); bundle vechi în browser, vezi migrația
//     20260912160000. Se șterge + se scoate opt-out-ul „auto: EXclient" și
//     umbra de nurture lăsate de cronul de noapte.
//  2. Alexandru Simiuc · Open Class · 1 sept 2026 cu data_final 28 iun 2026 —
//     artefact din importul v1 (old_user_sub_id = 0, uuid v5), 50 lei neplătiți,
//     invizibil în ambele sezoane. Se șterge.
//
// Ambele au zero prezențe, zero încasări, zero voucher_redemptions (verificat
// din nou la rulare — scriptul refuză dacă apare ceva).
//
// Rulare:  node scripts/fix-inrolari-in-afara-sezonului.mjs [--apply]
// Fără --apply = dry-run.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const APPLY = process.argv.includes('--apply')

const TARGETS = [
  {
    enrollment: '6dfdc127-cf69-4a51-bd8a-98154d333963',
    motiv: 'dublura pe 1 sept (inaintea startului de sezon) — inrolarea corecta e cea din 12 sept',
    client: 'feeaa20e-6d90-4b9a-8071-59dde84e1997',
    clearOptOut: true,
    stergeUmbraNurture: true,
  },
  {
    enrollment: '7c3f93da-8796-53c6-b744-f16537e16f39',
    motiv: 'artefact import v1: data_incepere 2026-09-01 cu data_final 2026-06-28',
    client: '74151da6-343b-5622-b173-ab7f374a5a52',
  },
]

const count = async (table, col, id) =>
  (await db.from(table).select('id', { count: 'exact', head: true }).eq(col, id)).count ?? 0

for (const t of TARGETS) {
  const { data: row, error } = await db
    .from('enrollments')
    .select('*')
    .eq('id', t.enrollment)
    .maybeSingle()
  if (error) throw error
  if (!row) {
    console.log(`— ${t.enrollment}: deja inexistent, sar`)
    continue
  }

  const deps = {
    prezente: await count('prezente', 'enrollment', t.enrollment),
    incasari: await count('incasari', 'inregistrare', t.enrollment),
    voucher_redemptions: await count('voucher_redemptions', 'enrollment', t.enrollment),
  }
  const blocked = Object.entries(deps).filter(([, n]) => n > 0)
  if (blocked.length) {
    console.error(`✋ ${t.enrollment} are dependențe: ${JSON.stringify(deps)} — NU se șterge`)
    process.exitCode = 1
    continue
  }

  const restante = (await db.rpc('get_client_restante', { p_client: t.client })).data
  console.log(
    `\n${APPLY ? 'ȘTERG' : 'DRY-RUN'} ${t.enrollment}` +
      ` · ${row.data_incepere} → ${row.data_final} · suma ${row.suma}` +
      `\n  restanțe client ÎNAINTE: ${JSON.stringify(restante)}`,
  )
  if (!APPLY) continue

  const ins = await db.from('audit_log').insert({
    actor_id: null,
    actor_role: 'system',
    action: 'enrollment_deleted',
    entity_type: 'enrollment',
    entity_id: t.enrollment,
    old_value: row,
    reason: t.motiv,
  })
  if (ins.error) throw ins.error

  const del = await db.from('enrollments').delete().eq('id', t.enrollment)
  if (del.error) throw del.error

  if (t.clearOptOut) {
    const c = await db.from('clienti').select('opt_out_marketing, opt_out_motiv').eq('id', t.client).single()
    if (c.data?.opt_out_motiv === 'auto: EXclient') {
      const r = await db.rpc('clear_opt_out', { p_entity: 'client', p_id: t.client })
      if (r.error) throw r.error
      console.log('  opt-out „auto: EXclient" șters')
    }
  }

  if (t.stergeUmbraNurture) {
    // aceeași condiție ca la curățarea din cron: rând pur generat, fără sursă
    // și fără atingere de om (contacte / programări / intake).
    const { data: umbre } = await db
      .from('leads')
      .select('id, created')
      .eq('id_client', t.client)
      .eq('status', 'nurture')
      .is('sursa', null)
    for (const u of umbre ?? []) {
      const atins =
        (await count('lead_contacte', 'lead', u.id)) +
        (await count('programari_leads', 'lead', u.id))
      if (atins > 0) {
        console.log(`  umbra ${u.id} are contacte/programări — o las cronului`)
        continue
      }
      const d = await db.from('leads').delete().eq('id', u.id)
      if (d.error) throw d.error
      console.log(`  umbră nurture ștearsă (${u.created})`)
    }
  }

  const dupa = (await db.rpc('get_client_restante', { p_client: t.client })).data
  console.log(`  restanțe client DUPĂ: ${JSON.stringify(dupa)}`)
}

console.log(APPLY ? '\nGata.' : '\nDry-run — rulează cu --apply.')
