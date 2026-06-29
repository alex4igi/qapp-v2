// Recuperare one-off: lead-ul „Anastasia Roiu" a fost convertit (status=convertit,
// data_conversie setată) dar clientul a dispărut și id_client a rămas NULL (FK
// on delete set null). Scriptul recreează clientul și re-leagă lead-ul.
// Idempotent: dacă există deja un client cu acest telefon, îl refolosește.
// Înrolarea în curs o face userul din app (EnrollmentForm) — NU aici.
//
//   node scripts/cleanup/recover-lead-anastasia.mjs           # dry-run (doar raportează)
//   node scripts/cleanup/recover-lead-anastasia.mjs --apply   # aplică
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const APPLY = process.argv.includes('--apply')
const LEAD_ID = 'f7699372-b458-4091-b85c-fcd48ad0f2ec'
const PHONE = '0766615918' // normalizat din +40766615918
const PHONE_TAIL = '766615918' // ultimele 9 cifre, pt. detecție duplicat indiferent de format

const log = (...a) => console.log(...a)

async function main() {
  // 0. validează lead-ul
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .select('id, nume, prenume, telefon, status, id_client, data_conversie')
    .eq('id', LEAD_ID)
    .single()
  if (leadErr || !lead) throw new Error('Lead-ul nu a fost găsit: ' + (leadErr?.message ?? ''))
  log('Lead:', { nume: lead.nume, prenume: lead.prenume, status: lead.status, id_client: lead.id_client })

  if (lead.id_client) {
    log('✓ Lead-ul are deja id_client =', lead.id_client, '— nimic de făcut.')
    return
  }

  // 1. detecție duplicat după telefon (orice format care conține coada de 9 cifre)
  const { data: existing } = await sb
    .from('clienti')
    .select('id, nume, prenume, telefon, status')
    .or(`telefon.ilike.%${PHONE_TAIL}%,telefonul_2.ilike.%${PHONE_TAIL}%`)
  let clientId = existing && existing.length ? existing[0].id : null
  if (clientId) {
    log('• Client existent găsit, îl refolosesc:', existing[0])
  } else {
    log('• Niciun client cu acest telefon — voi crea unul nou.')
  }

  if (!APPLY) {
    log('\n[dry-run] Aș face:')
    if (!clientId) log("  - INSERT clienti { nume:'Roiu', prenume:'Anastasia', telefon:'" + PHONE + "', status:'Activ' }")
    log('  - UPDATE leads SET id_client = <client> WHERE id =', LEAD_ID)
    log('\nRulează cu --apply pentru a aplica.')
    return
  }

  // 2. creează clientul (oglindește ce ar fi făcut ConversieModal)
  if (!clientId) {
    const { data: created, error: cErr } = await sb
      .from('clienti')
      .insert({
        nume: 'Roiu',
        prenume: 'Anastasia',
        telefon: PHONE,
        status: 'Activ',
      })
      .select('id')
      .single()
    if (cErr) throw new Error('Creare client eșuată: ' + cErr.message)
    clientId = created.id
    log('✓ Client creat:', clientId)
  }

  // 3. re-leagă lead-ul (păstrează status=convertit + data_conversie)
  const { error: uErr } = await sb.from('leads').update({ id_client: clientId }).eq('id', LEAD_ID)
  if (uErr) throw new Error('Re-legare lead eșuată: ' + uErr.message)
  log('✓ Lead re-legat: id_client =', clientId)

  // 4. verificare
  const { data: vLead } = await sb.from('leads').select('id, status, id_client').eq('id', LEAD_ID).single()
  const { data: vClient } = await sb.from('clienti').select('id, nume, prenume, telefon, status').eq('id', clientId).single()
  log('\n=== VERIFICARE ===')
  log('lead:', vLead)
  log('client:', vClient)
  if (vLead?.id_client === clientId && vClient) log('✓ OK — clientul există și lead-ul e legat de el.')
  else log('✗ ATENȚIE — verificarea a eșuat.')
}

main().catch((e) => {
  console.error('EROARE:', e.message)
  process.exit(1)
})
