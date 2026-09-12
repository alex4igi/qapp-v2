// Importă în `reinscrieri_semnate` campania de reînscrieri ținută în Excel.
//
// Campania 2026-2027 (aprilie–iunie) a rulat integral în afara CRM-ului, în trei registre
// `PROMO reinscrieri 26-27`. Scriptul aduce în DB CINE A SEMNAT; dacă omul a ajuns sau nu
// în sezonul nou se citește live din enrollments, nu se importă.
//
// Sursa: docs/Reinscrieri 25-26/match.json — rezultatul potrivirii nume Excel ↔ fișă CRM,
// făcută o singură dată offline (fișierul ține și tipul potrivirii și fișele duplicat).
// Registrele .xlsx stau în același folder; JSON-ul e derivatul lor, ținut în afara git-ului
// pentru că are nume de persoane.
//
// Rulare:  node scripts/import-reinscrieri-semnate.mjs [--sezon "Sezon 2026-2027"] [--dry] [--reset]
// Idempotent: upsert pe (sezon_id, locatie_excel, nume_excel).
// --reset șterge întâi rândurile sezonului. Necesar doar dacă se schimbă felul în care
// se scrie locația sau numele, altfel upsertul ar lăsa în urmă rândurile vechi.

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
const svc = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const reset = args.includes('--reset')
const sezonNume = args.includes('--sezon')
  ? args[args.indexOf('--sezon') + 1]
  : 'Sezon 2026-2027'

const SURSA = new URL('../docs/Reinscrieri 25-26/match.json', import.meta.url)

// Registrele scriu locația scurt. Le aduc la numele din tabela `locatii`, ca filtrele
// din /start-sezon să arate aceeași sală la fel în toate secțiunile paginii.
const LOCATII = {
  STEFAN: 'Galeriile Stefan cel Mare',
  Nicolina: 'Nicolina',
  Q4Kids: 'Quasar 4 Kids',
}

const { data: sezon, error: eSezon } = await svc
  .from('sezoane')
  .select('id, numele_sezonului')
  .eq('numele_sezonului', sezonNume)
  .maybeSingle()
if (eSezon) throw eSezon
if (!sezon) throw new Error(`Nu găsesc sezonul „${sezonNume}"`)

const brut = JSON.parse(readFileSync(SURSA, 'utf8'))
const randuri = brut.map((x) => ({
  sezon_id: sezon.id,
  client: x.crm ?? null,
  nume_excel: x.nume,
  locatie_excel: LOCATII[x.loc] ?? x.loc,
  // în JSON grupele vin prefixate cu locația: „Nicolina/Dans JR Lmi INC"
  grupe_excel: (x.grupe ?? []).map((g) => (g.includes('/') ? g.split('/').slice(1).join('/') : g)),
  potrivire: x.match ?? 'exact',
  dublura_nume: x.dublura ?? null,
}))

const peTip = randuri.reduce((a, r) => ((a[r.potrivire] = (a[r.potrivire] ?? 0) + 1), a), {})
const faraFisa = randuri.filter((r) => !r.client).length
console.log(`sezon         : ${sezon.numele_sezonului} (${sezon.id})`)
console.log(`rânduri       : ${randuri.length}`)
console.log(`potrivire     : ${JSON.stringify(peTip)}`)
console.log(`fără fișă CRM : ${faraFisa}`)
console.log(`locații       : ${JSON.stringify([...new Set(randuri.map((r) => r.locatie_excel))])}`)

if (dry) {
  console.log('\n--dry: nu am scris nimic.')
  process.exit(0)
}

if (reset) {
  const { error: eDel } = await svc
    .from('reinscrieri_semnate')
    .delete()
    .eq('sezon_id', sezon.id)
  if (eDel) throw eDel
  console.log('\n--reset: am șters rândurile existente ale sezonului.')
}

const { error, count } = await svc
  .from('reinscrieri_semnate')
  .upsert(randuri, { onConflict: 'sezon_id,locatie_excel,nume_excel', count: 'exact' })
if (error) throw error

const { count: total } = await svc
  .from('reinscrieri_semnate')
  .select('*', { count: 'exact', head: true })
  .eq('sezon_id', sezon.id)
console.log(`\n✅ scrise ${count ?? randuri.length} · în tabel pentru sezon: ${total}`)
