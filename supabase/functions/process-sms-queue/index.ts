// Edge Function: procesează coada de SMS-uri (situatie_sms_uri).
// Pentru fiecare rând cu status 'De trimis' apelează sendSms și actualizează statusul.
// Mesajul e deja compus și stocat în rând — nu folosește buildSms.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendSms } from '../_shared/sms.ts'
import { deferUntil, getQuietHoursConfig, isQuiet } from '../_shared/quietHours.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: queue, error } = await supabase
      .from('situatie_sms_uri')
      .select('id, telefon, mesaj')
      .eq('status', 'De trimis')

    if (error) return json({ error: error.message }, 500)

    // Zonă interzisă: și batch-urile manuale o respectă. Mutăm fiecare rând valid
    // în coada de noapte (sms_amanate) și îl marcăm 'Amanat' — process-sms-amanate
    // îl trimite după 10:00. Nu trimitem nimic acum.
    const now = new Date()
    const quietCfg = await getQuietHoursConfig(supabase)
    if (isQuiet(now, quietCfg)) {
      const next = deferUntil(now, quietCfg)
      let deferred = 0
      let invalid = 0
      for (const row of queue ?? []) {
        if (!row.telefon || !row.mesaj) {
          await supabase
            .from('situatie_sms_uri')
            .update({ status: 'Esuat' })
            .eq('id', row.id)
          invalid++
          continue
        }
        await supabase.from('sms_amanate').insert({
          telefon: row.telefon,
          mesaj: row.mesaj,
          tip: 'manual',
          send_after: next,
        })
        await supabase
          .from('situatie_sms_uri')
          .update({ status: 'Amanat' })
          .eq('id', row.id)
        deferred++
      }
      return json({ total: queue?.length ?? 0, deferred, failed: invalid, quiet: true })
    }

    const today = new Date().toISOString().slice(0, 10)
    let sent = 0
    let failed = 0

    for (const row of queue ?? []) {
      if (!row.telefon || !row.mesaj) {
        await supabase
          .from('situatie_sms_uri')
          .update({ status: 'Esuat' })
          .eq('id', row.id)
        failed++
        continue
      }

      const result = await sendSms(row.telefon, row.mesaj)
      if (result.ok) {
        await supabase
          .from('situatie_sms_uri')
          .update({ status: 'Trimis', data_trimitere: today })
          .eq('id', row.id)
        sent++
      } else {
        await supabase
          .from('situatie_sms_uri')
          .update({ status: 'Esuat' })
          .eq('id', row.id)
        failed++
      }
    }

    return json({ total: queue?.length ?? 0, sent, failed })
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
