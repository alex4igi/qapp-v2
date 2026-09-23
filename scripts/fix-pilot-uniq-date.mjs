// Corecții punctuale de date înainte de pilotul portalului pe trupa UNIQ (2026-09-12).
//
// 1. Nitisor Petruta Maria (recepție + dansatoare UNIQ): contul ei de portal e legat de
//    familia „Nitisor", dar clientul ei avea `familia = null` → s-ar fi logat și n-ar fi
//    văzut nimic (client_member_ids() nu-l returna). Familia NU e o fantomă: contractul din
//    3 sept e deja emis pe perechea (client, familie), deci atașăm clientul la familie —
//    nu mutăm contul și nu ștergem nimic.
// 2. Telefon salvat fără 0 în față (751262684) → 07…, ca să treacă de normalizarea SMS.
//
// Rulare: node scripts/fix-pilot-uniq-date.mjs [--dry-run]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const dry = process.argv.includes('--dry-run')

const CLIENT_NITISOR = '80d3160c-d6c5-54ca-b316-fce72aa2a73f'
const FAMILIE_NITISOR = 'd69dfcfe-cff9-5d2e-9b08-b9b81b34c9a8'

const { data: before } = await db.from('clienti')
  .select('id, nume, prenume, telefon, familia, auth_user_id')
  .in('id', [CLIENT_NITISOR])
console.log('înainte:', before)

if (!dry) {
  const { data, error } = await db.from('clienti')
    .update({ familia: FAMILIE_NITISOR }).eq('id', CLIENT_NITISOR)
    .select('id, nume, prenume, familia')
  console.log(error ? `✗ Nitisor: ${error.message}` : '✓ Nitisor atașată la familie:', data)

  const { data: tel, error: telErr } = await db.from('clienti')
    .update({ telefon: '0751262684' }).eq('telefon', '751262684')
    .select('id, nume, prenume, telefon')
  console.log(telErr ? `✗ telefon: ${telErr.message}` : '✓ telefon normalizat:', tel)
}
