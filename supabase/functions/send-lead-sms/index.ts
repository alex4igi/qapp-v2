// Edge Function: trimite un SMS pentru un lead, în funcție de tipul tranziției.
// Apelată din client după schimbările de status. Dedup prin tabelul sms_logs.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSms, sendSms, type SmsTip } from '../_shared/sms.ts'
import { deferUntil, getQuietHoursConfig, isQuiet } from '../_shared/quietHours.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const VALID_TIPURI: SmsTip[] = [
  'confirmare',
  'reminder',
  'review',
  'followup',
  'waiting_list',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { leadId, tip } = await req.json()

    if (!leadId || !VALID_TIPURI.includes(tip)) {
      return json({ error: 'leadId și tip valide sunt obligatorii' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select(
        'id, prenume, nume, telefon, locatia, grupa_varsta, data_programare',
      )
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return json({ error: 'Lead inexistent' }, 404)
    }
    if (!lead.telefon) {
      return json({ skipped: true, reason: 'fără telefon' })
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

    // Ora ședinței vine din ultima programare (rezolvată din curs/eveniment).
    const { data: programare } = await supabase
      .from('programari_leads')
      .select('ora')
      .eq('lead', leadId)
      .order('data_programarii', { ascending: false })
      .limit(1)
      .maybeSingle()

    const mesaj = buildSms(tip, {
      prenume: lead.prenume || lead.nume,
      locatie: lead.locatia,
      grupa: lead.grupa_varsta,
      dataProgramare: lead.data_programare,
      ora: programare?.ora ?? null,
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
