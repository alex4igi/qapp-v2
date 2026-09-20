// Edge Function: procesează coada de SMS-uri (situatie_sms_uri).
// Pentru fiecare rând cu status 'De trimis' AJUNS LA SCADENȚĂ apelează sendSms și
// actualizează statusul. Mesajul e deja compus și stocat în rând — nu folosește
// buildSms.
//
// `data_planificata` e un termen, nu o etichetă (decizie 20.09.2026): până acum
// drain-ul lua tot ce era 'De trimis', deci data pusă în „+ SMS manual" nu amâna
// nimic — un mesaj programat pentru 1 octombrie pleca la prima apăsare pe
// „Trimite cele de trimis". Rândurile fără dată rămân „de trimis acum" (așa le
// scrie compozitorul bulk și fluxul de contracte).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ALL_STAFF, requireStaffRole } from '../_shared/staffAuth.ts'
import { sendSms } from '../_shared/sms.ts'
import {
  deferUntil,
  getQuietHoursConfig,
  isQuiet,
  localDateBucharest,
} from '../_shared/quietHours.ts'

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

    // Drenarea cozii trimite SMS-uri reale — o cheamă `/sms`, deci tot staff-ul
    // non-teacher. `verify_jwt` singur ar fi acceptat și cheia publică anon.
    const auth = await requireStaffRole(req, ALL_STAFF, supabase)
    if (!auth.ok) return json({ error: auth.error }, auth.status)

    // Ziua locală, nu ISO-ul UTC: `data_planificata` e `date`, iar după 21:00
    // local un `toISOString()` ar cădea deja pe ziua următoare.
    const azi = localDateBucharest(new Date())

    const { data: queue, error } = await supabase
      .from('situatie_sms_uri')
      .select('id, telefon, mesaj, data_planificata')
      .eq('status', 'De trimis')
      .or(`data_planificata.is.null,data_planificata.lte.${azi}`)

    if (error) return json({ error: error.message }, 500)

    // Contorul de rânduri încă neajunse la termen — ca operatorul să vadă în
    // rezultat că au rămas pe loc intenționat, nu că s-au pierdut.
    const { count: programate } = await supabase
      .from('situatie_sms_uri')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'De trimis')
      .gt('data_planificata', azi)

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
        // `sursa_id` = legătura înapoi spre rândul din listă; fără ea drain-ul nu
        // are pe cine să treacă pe 'Trimis' și statusul 'Amanat' rămâne pe veci.
        await supabase.from('sms_amanate').insert({
          telefon: row.telefon,
          mesaj: row.mesaj,
          tip: 'manual',
          send_after: next,
          sursa_id: row.id,
        })
        await supabase
          .from('situatie_sms_uri')
          .update({
            status: 'Amanat',
            data_planificata: localDateBucharest(new Date(next)),
          })
          .eq('id', row.id)
        deferred++
      }
      return json({
        total: queue?.length ?? 0,
        deferred,
        failed: invalid,
        programate: programate ?? 0,
        quiet: true,
      })
    }

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
          .update({ status: 'Trimis', data_trimitere: azi })
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

    return json({ total: queue?.length ?? 0, sent, failed, programate: programate ?? 0 })
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
