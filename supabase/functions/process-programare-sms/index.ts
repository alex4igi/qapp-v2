// Edge Function cron — drenează coada `confirmari_programare_sms`.
// Pentru fiecare rând scadent (send_after <= now, status 'programat'):
//   - reciteste leadul + ultima programare (ora e mereu la zi),
//   - daca leadul nu mai e 'programat' → marcheaza 'anulat' (fara SMS),
//   - altfel compune confirmarea (data + ora + adresa) si o trimite,
//   - dedup prin sms_logs (lead_id + tip='confirmare').
// Apelata de pg_cron la ~1 min. Delay-ul de 2 min vine din send_after.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSms, sendSms } from '../_shared/sms.ts'
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

  // Zonă interzisă: dacă suntem în fereastră, împinge tot lotul scadent spre
  // dimineață (lasă status 'programat') și ieși — cronul de 1 min le reia la 10:00.
  const now = new Date()
  const quietCfg = await getQuietHoursConfig(supabase)
  const nowIso = now.toISOString()
  if (isQuiet(now, quietCfg)) {
    const next = deferUntil(now, quietCfg)
    const { data: deferred } = await supabase
      .from('confirmari_programare_sms')
      .update({ send_after: next })
      .eq('status', 'programat')
      .lte('send_after', nowIso)
      .select('id')
    return Response.json({ deferred: deferred?.length ?? 0, quiet: true })
  }
  const { data: due, error } = await supabase
    .from('confirmari_programare_sms')
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
      .select(
        'id, prenume, nume, telefon, locatia, grupa_varsta, data_programare, status',
      )
      .eq('id', row.lead_id)
      .single()

    // Lead șters / ieșit din 'programat' (undo în fereastră) → anulează rândul.
    if (!lead || lead.status !== 'programat' || !lead.data_programare) {
      await supabase
        .from('confirmari_programare_sms')
        .update({ status: 'anulat' })
        .eq('id', row.id)
      canceled++
      continue
    }
    if (!lead.telefon) {
      await supabase
        .from('confirmari_programare_sms')
        .update({ status: 'esuat', error: 'fără telefon' })
        .eq('id', row.id)
      failed++
      continue
    }

    // Dedup: dacă deja s-a trimis o confirmare pentru acest lead, marchează trimis.
    const { data: existing } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('tip', 'confirmare')
      .maybeSingle()
    if (existing) {
      await supabase
        .from('confirmari_programare_sms')
        .update({ status: 'trimis', trimis_la: new Date().toISOString() })
        .eq('id', row.id)
      continue
    }

    // Ora din ultima programare (rezolvată din curs/eveniment la programare).
    const { data: programare } = await supabase
      .from('programari_leads')
      .select('ora')
      .eq('lead', lead.id)
      .order('data_programarii', { ascending: false })
      .limit(1)
      .maybeSingle()

    const mesaj = buildSms('confirmare', {
      prenume: lead.prenume || lead.nume,
      locatie: lead.locatia,
      grupa: lead.grupa_varsta,
      dataProgramare: lead.data_programare,
      ora: programare?.ora ?? null,
    })

    const result = await sendSms(lead.telefon, mesaj)
    if (result.ok) {
      await supabase.from('sms_logs').insert({
        lead_id: lead.id,
        tip: 'confirmare',
        telefon: lead.telefon,
        mesaj,
      })
      await supabase
        .from('confirmari_programare_sms')
        .update({ status: 'trimis', trimis_la: new Date().toISOString() })
        .eq('id', row.id)
      sent++
    } else {
      await supabase
        .from('confirmari_programare_sms')
        .update({ status: 'esuat', error: result.error ?? 'eroare necunoscută' })
        .eq('id', row.id)
      failed++
    }
  }

  return Response.json({ total: due?.length ?? 0, sent, canceled, failed })
})
