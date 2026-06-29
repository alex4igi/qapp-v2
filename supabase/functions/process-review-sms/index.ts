// Edge Function cron — drenează coada `confirmari_review_sms`.
// Pentru fiecare rând scadent (send_after <= now, status 'programat'):
//   - reciteste leadul,
//   - daca leadul nu mai e 'convertit' → marcheaza 'anulat' (fara SMS),
//   - altfel compune SMS-ul de review (link Google pe locatie) si il trimite,
//   - dedup prin sms_logs (lead_id + tip='review').
// Apelata de pg_cron la ~1 min. Delay-ul de 5 min vine din send_after — fereastra
// de undo: daca recepatia anuleaza/revine din conversie, SMS-ul nu mai pleaca.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSms, sendSms } from '../_shared/sms.ts'

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

  const nowIso = new Date().toISOString()
  const { data: due, error } = await supabase
    .from('confirmari_review_sms')
    .select('id, lead_id')
    .eq('status', 'programat')
    .lte('send_after', nowIso)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  let sent = 0
  let canceled = 0
  let failed = 0

  for (const row of due ?? []) {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, prenume, nume, telefon, locatia, grupa_varsta, status')
      .eq('id', row.lead_id)
      .single()

    // Lead șters / ieșit din 'convertit' (undo în fereastră) → anulează rândul.
    if (!lead || lead.status !== 'convertit') {
      await supabase
        .from('confirmari_review_sms')
        .update({ status: 'anulat' })
        .eq('id', row.id)
      canceled++
      continue
    }
    if (!lead.telefon) {
      await supabase
        .from('confirmari_review_sms')
        .update({ status: 'esuat', error: 'fără telefon' })
        .eq('id', row.id)
      failed++
      continue
    }

    // Dedup: dacă deja s-a trimis un review pentru acest lead, marchează trimis.
    const { data: existing } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('tip', 'review')
      .maybeSingle()
    if (existing) {
      await supabase
        .from('confirmari_review_sms')
        .update({ status: 'trimis', trimis_la: new Date().toISOString() })
        .eq('id', row.id)
      continue
    }

    const mesaj = buildSms('review', {
      prenume: lead.prenume || lead.nume,
      locatie: lead.locatia,
      grupa: lead.grupa_varsta,
    })

    const result = await sendSms(lead.telefon, mesaj)
    if (result.ok) {
      await supabase.from('sms_logs').insert({
        lead_id: lead.id,
        tip: 'review',
        telefon: lead.telefon,
        mesaj,
      })
      await supabase
        .from('confirmari_review_sms')
        .update({ status: 'trimis', trimis_la: new Date().toISOString() })
        .eq('id', row.id)
      sent++
    } else {
      await supabase
        .from('confirmari_review_sms')
        .update({ status: 'esuat', error: result.error ?? 'eroare necunoscută' })
        .eq('id', row.id)
      failed++
    }
  }

  return Response.json({ total: due?.length ?? 0, sent, canceled, failed })
})
