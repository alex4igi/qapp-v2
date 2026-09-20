// Edge Function: trimite un SMS pentru un lead, în funcție de tipul tranziției.
// Apelată din aplicația de staff după schimbările de status (rol verificat în corp,
// vezi _shared/staffAuth.ts). Dedup prin tabelul sms_logs.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ALL_STAFF, requireStaffRole } from '../_shared/staffAuth.ts'
import { buildSms, sendSms, type SmsTip } from '../_shared/sms.ts'
import { getProgramareSms } from '../_shared/leadLocatie.ts'
import { deferUntil, getQuietHoursConfig, isQuiet } from '../_shared/quietHours.ts'
import { esteMarketing } from '../_shared/smsCategorie.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const VALID_TIPURI: SmsTip[] = [
  'confirmare',
  'reminder',
  'review',
  'waiting_list',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Staff, nu „orice token valid": `verify_jwt` acceptă și cheia publică anon.
    const auth = await requireStaffRole(req, ALL_STAFF, supabase)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    const { leadId, tip } = await req.json()

    if (!leadId || !VALID_TIPURI.includes(tip)) {
      return json({ error: 'leadId și tip valide sunt obligatorii' }, 400)
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(
        'id, prenume, nume, telefon, locatia, grupa_varsta, data_programare, deja_client, opt_out_marketing',
      )
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return json({ error: 'Lead inexistent' }, 404)
    }
    if (!lead.telefon) {
      return json({ skipped: true, reason: 'fără telefon' })
    }
    // Lead „deja client" e scos din fluxul rece — nu i se trimite SMS automat.
    if (lead.deja_client) {
      return json({ skipped: true, reason: 'deja client' })
    }
    // Opt-out-ul oprește DOAR marketingul (vezi _shared/smsCategorie.ts):
    // confirmarea programării și reminderul pleacă în continuare, fiindcă le-a
    // provocat omul înscriindu-se — n-are sens să-l lăsăm să vină degeaba.
    if (lead.opt_out_marketing && esteMarketing(tip)) {
      return json({ skipped: true, reason: 'opt-out marketing' })
    }

    // Dedup — un SMS de un anumit tip se trimite o singură dată per lead
    const { data: existing } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('lead_id', leadId)
      .eq('tip', tip)
      .maybeSingle()

    if (existing) {
      return json({ skipped: true, reason: 'deja trimis' })
    }

    // Ora + locația vin din ultima programare (rezolvate din curs/eveniment);
    // lead.locatia e doar fallback.
    const { ora, locatie } = await getProgramareSms(supabase, leadId, lead.locatia)

    const mesaj = buildSms(tip, {
      prenume: lead.prenume || lead.nume,
      locatie,
      dataProgramare: lead.data_programare,
      ora,
    })

    // Zonă interzisă: nu trimitem acum — punem mesajul (deja compus) în coada
    // sms_amanate, drenată de process-sms-amanate după ce iese din fereastră.
    const now = new Date()
    const quietCfg = await getQuietHoursConfig(supabase)
    if (isQuiet(now, quietCfg)) {
      await supabase.from('sms_amanate').insert({
        telefon: lead.telefon,
        mesaj,
        tip,
        lead_id: leadId,
        send_after: deferUntil(now, quietCfg),
      })
      return json({ deferred: true })
    }

    const result = await sendSms(lead.telefon, mesaj)

    // Logăm în sms_logs doar dacă trimiterea a reușit (sau a fost stub) —
    // un eșec real nu trebuie să blocheze o reîncercare ulterioară.
    if (result.ok) {
      await supabase.from('sms_logs').insert({
        lead_id: leadId,
        tip,
        telefon: lead.telefon,
        mesaj,
      })
    }

    return json({
      ok: result.ok,
      stub: result.stub,
      testMode: result.testMode,
      raw: result.raw,
      error: result.error,
    })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
