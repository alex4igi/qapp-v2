// Edge Function cron — drenează coada `sms_amanate` (SMS amânate de zona interzisă).
// Pentru fiecare rând scadent (send_after <= now, status 'in_asteptare'):
//   - dacă suntem ÎNCĂ în fereastra interzisă → împinge send_after spre dimineață, skip
//     (gardianul autoritar, imun la ora de vară/iarnă),
//   - altfel trimite mesajul (deja compus) și marchează 'trimis'/'esuat',
//   - dacă rândul provine dintr-un lead (lead_id + tip), loghează în sms_logs pentru
//     dedup consecvent cu celelalte căi.
// Apelată de pg_cron la ~1 min (vezi cron-setup.sql).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendSms } from '../_shared/sms.ts'
import { deferUntil, getQuietHoursConfig, isQuiet } from '../_shared/quietHours.ts'

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const quietCfg = await getQuietHoursConfig(supabase)
  const nowIso = now.toISOString()

  const { data: due, error } = await supabase
    .from('sms_amanate')
    .select('id, telefon, mesaj, tip, lead_id')
    .eq('status', 'in_asteptare')
    .lte('send_after', nowIso)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Încă în fereastră → re-amână tot lotul și ieși.
  if (isQuiet(now, quietCfg)) {
    const next = deferUntil(now, quietCfg)
    await supabase
      .from('sms_amanate')
      .update({ send_after: next })
      .eq('status', 'in_asteptare')
      .lte('send_after', nowIso)
    return Response.json({ deferred: due?.length ?? 0, quiet: true })
  }

  let sent = 0
  let failed = 0

  for (const row of due ?? []) {
    if (!row.telefon || !row.mesaj) {
      await supabase
        .from('sms_amanate')
        .update({ status: 'esuat', error: 'fără telefon/mesaj' })
        .eq('id', row.id)
      failed++
      continue
    }

    const result = await sendSms(row.telefon, row.mesaj)
    if (result.ok) {
      if (row.lead_id && row.tip) {
        await supabase.from('sms_logs').insert({
          lead_id: row.lead_id,
          tip: row.tip,
          telefon: row.telefon,
          mesaj: row.mesaj,
        })
      }
      await supabase
        .from('sms_amanate')
        .update({ status: 'trimis', trimis_la: new Date().toISOString() })
        .eq('id', row.id)
      sent++
    } else {
      await supabase
        .from('sms_amanate')
        .update({ status: 'esuat', error: result.error ?? 'eroare necunoscută' })
        .eq('id', row.id)
      failed++
    }
  }

  return Response.json({ total: due?.length ?? 0, sent, failed })
})
