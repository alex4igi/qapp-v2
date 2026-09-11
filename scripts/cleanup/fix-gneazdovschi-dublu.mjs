// One-off 2026-09-11: Ana Gneazdovschi.
//  1. Dublul din v1 (B, EXclient, istoric 2021) intră în clientul creat azi din
//     lead (A) — conversia nu l-a găsit (telefon 0… vs +40…).
//  2. Leadul fusese rescris în „programat" (+ programare nouă + SMS) de un
//     LeadModal rămas deschis după înrolare — îl readucem în „convertit".
// DRY-RUN implicit; `--apply` execută (backup JSON înainte).
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(ROOT + 'package.json')
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(
  fs.readFileSync(ROOT + '.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

const A = 'd4594e69-7390-4e6d-943d-e4662c86c28a'
const B = 'd5bfeb23-74b6-503a-a08c-56d0b1678c2e'
const LEAD = '9f02cfe5-4f73-46b8-a0cd-e6719facc2f1'
const SHADOW = '2ee4bde2-a856-4902-a40c-b967177228e8'
const PROG_FALSA = 'c8440ae3-415f-4929-abef-b5a59e7a6ff7'

// FK-uri spre clienti din secțiunea Tables (schema public) a tipurilor generate —
// lista din dedupe-lib e din iunie și nu mai e completă.
const types = fs.readFileSync(ROOT + 'src/types/database.ts', 'utf8')
const tStart = types.indexOf('    Tables: {', types.indexOf('  public: {'))
const lines = types.slice(tStart, types.indexOf('    Views: {', tStart)).split('\n')
const fks = []
let table = null
lines.forEach((l, i) => {
  const m = l.match(/^      ([a-z_0-9]+): \{$/)
  if (m) table = m[1]
  if (l.includes('referencedRelation: "clienti"')) {
    for (let j = i; j > i - 6; j--) {
      const c = lines[j].match(/columns: \["([a-z_0-9]+)"\]/)
      if (c) { fks.push([table, c[1]]); break }
    }
  }
})
console.log(`FK-uri spre clienti: ${fks.length}`)

const must = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data }

const deB = {}
for (const [t, c] of fks) {
  const rows = await must(svc.from(t).select('*').eq(c, B))
  if (rows.length) deB[`${t}.${c}`] = rows
}
console.log('Rânduri legate de B:', Object.fromEntries(Object.entries(deB).map(([k, v]) => [k, v.length])))

const clienti = await must(svc.from('clienti').select('*').in('id', [A, B]))
const cA = clienti.find((c) => c.id === A)
const cB = clienti.find((c) => c.id === B)
if (!cA || !cB) throw new Error('A sau B lipsește — deja rulat?')
const leads = await must(svc.from('leads').select('*').in('id', [LEAD, SHADOW]))
const prog = await must(svc.from('programari_leads').select('*').eq('id', PROG_FALSA))
const coada = await must(svc.from('confirmari_programare_sms').select('*').eq('lead_id', LEAD))

// Umbra de nurture trebuie să fie „pur generată" (regula din auto_mark_inactiv_si_exclient pas 4).
const shadow = leads.find((l) => l.id === SHADOW)
const atinsa = [
  ...(await must(svc.from('lead_contacte').select('id').eq('lead_id', SHADOW))),
  ...(await must(svc.from('programari_leads').select('id').eq('lead', SHADOW))),
  ...(await must(svc.from('sms_logs').select('id').eq('lead_id', SHADOW))),
]
if (!shadow || shadow.sursa || atinsa.length) throw new Error('Umbra B nu e pur generată — oprit.')

const lead = leads.find((l) => l.id === LEAD)
console.log(`Lead ${LEAD.slice(0, 8)}: status=${lead.status}, data_conversie=${lead.data_conversie}`)
console.log(`Programare de șters: ${prog.map((p) => `${p.data_programarii} ${p.ora} ${p.prezenta}`).join(', ') || '(nu mai există)'}`)
console.log(`A primește: email=${cB.email}, old_user_id=${cB.old_user_id}; data_nasterii rămâne ${cA.data_nasterii} (B avea ${cB.data_nasterii})`)

if (!APPLY) {
  console.log('\nDRY-RUN — nimic modificat. Rulează cu --apply.')
  process.exit(0)
}

const bak = ROOT + 'scripts/cleanup/_merged_clients_backup_20260911_gneazdovschi.json'
fs.writeFileSync(bak, JSON.stringify({ clienti, deB, leads, prog, coada }, null, 2))
console.log(`Backup → ${bak}`)

await must(svc.from('leads').update({ status: 'convertit' }).eq('id', LEAD).eq('status', 'programat').select('id'))
await must(svc.from('programari_leads').delete().eq('id', PROG_FALSA).select('id'))
await must(svc.from('leads').delete().eq('id', SHADOW).select('id'))
for (const [t, c] of fks) {
  if (!deB[`${t}.${c}`] || `${t}.${c}` === 'leads.id_client') continue
  const moved = await must(svc.from(t).update({ [c]: A }).eq(c, B).select('id'))
  console.log(`  ${t}.${c}: ${moved.length} mutate pe A`)
}
await must(svc.from('clienti').delete().eq('id', B).select('id'))
await must(svc.from('clienti').update({ email: cB.email, old_user_id: cB.old_user_id }).eq('id', A).select('id'))

const fin = await must(svc.from('clienti').select('id,nume,prenume,telefon,email,status,old_user_id,data_nasterii').ilike('telefon', '%745628767'))
const finLead = await must(svc.from('leads').select('id,status,id_client,data_conversie').ilike('telefon', '%745628767'))
const finProg = await must(svc.from('programari_leads').select('id,data_programarii,prezenta').eq('lead', LEAD))
console.log('\nFINAL clienti:', fin)
console.log('FINAL leads:', finLead)
console.log('FINAL programări lead:', finProg)
