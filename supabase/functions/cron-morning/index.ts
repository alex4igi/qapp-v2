// Edge Function cron — dimineață.
// 1. Remindere programări, cu text adaptiv:
//    - Luni-Vineri → reminder "AZI" pentru programările zilei
//    - dacă mâine e Sâmbătă/Duminică → reminder "MAINE" (deci Vineri trimite
//      AZI + MAINE, Sâmbătă trimite doar MAINE pentru Duminică)
// 2. Review întârziat — SMS review pentru participanții de ieri (o zi după
//    ședință, ca leadul "să doarmă peste experiență").
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSms, sendSms } from '../_shared/sms.ts'

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setUTCHours(23, 59, 59, 999)
  return d.toISOString()
}

const dateStr = (d: Date) => d.toISOString().slice(0, 10)

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
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const now = new Date()
  const sent: string[] = []
  const reviews: string[] = []
  const errors: string[] = []

  // --- 1. Remindere adaptive ---
  const dow = now.getUTCDay() // 0=Dum … 6=Sâm
  const targets: { day: Date; cand: 'azi' | 'maine' }[] = []
  if (dow >= 1 && dow <= 5) targets.push({ day: new Date(now), cand: 'azi' })
  const tomorrow = new Date(now.getTime() + 86_400_000)
  const tdow = tomorrow.getUTCDay()
  if (tdow === 6 || tdow === 0) targets.push({ day: tomorrow, cand: 'maine' })

  for (const t of targets) {
    const { data: leads } = await supabase
      .from('leads')
      .select(
        'id, prenume, nume, telefon, locatia, grupa_varsta, data_programare',
      )
      .eq('status', 'programat')
      .gte('data_programare', startOfDay(t.day))
      .lte('data_programare', endOfDay(t.day))

    for (const lead of leads ?? []) {
      if (!lead.telefon) continue

      // Reminder se trimite o singură dată pe zi (idempotent), dar se reia
      // la o reprogramare ulterioară — vezi decizia 6.4.
      const { data: existing } = await supabase
        .from('sms_logs')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('tip', 'reminder')
        .eq('status', 'sent')
        .gte('trimis_la', startOfDay(now))
        .maybeSingle()
      if (existing) continue

      const mesaj = buildSms('reminder', {
        prenume: lead.prenume || lead.nume,
        locatie: lead.locatia,
        grupa: lead.grupa_varsta,
        dataProgramare: lead.data_programare,
        cand: t.cand,
      })

      const result = await sendSms(lead.telefon, mesaj)
      await supabase.from('sms_logs').insert({
        lead_id: lead.id,
        tip: 'reminder',
        telefon: lead.telefon,
        mesaj,
        status: result.ok ? 'sent' : 'failed',
        error: result.ok ? null : result.error,
      })
      if (result.ok) sent.push(`${lead.prenume ?? ''} ${lead.nume}`.trim())
      else errors.push(`${lead.nume}: ${result.error}`)
    }
  }

  // --- 2. Review întârziat — participanții de ieri ---
  const yesterday = new Date(now.getTime() - 86_400_000)
  const { data: prezente } = await supabase
    .from('programari_leads')
    .select(
      'lead, leads(id, prenume, nume, telefon, locatia, grupa_varsta, status)',
    )
    .eq('data_programarii', dateStr(yesterday))
    .eq('prezenta', 'prezent')

  for (const p of prezente ?? []) {
    const lead = Array.isArray(p.leads) ? p.leads[0] : p.leads
    if (!lead || lead.status !== 'a_venit' || !lead.telefon) continue

    const { data: existing } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('tip', 'review')
      .eq('status', 'sent')
      .maybeSingle()
    if (existing) continue

    const mesaj = buildSms('review', {
      prenume: lead.prenume || lead.nume,
      locatie: lead.locatia,
      grupa: lead.grupa_varsta,
    })

    const result = await sendSms(lead.telefon, mesaj)
    await supabase.from('sms_logs').insert({
      lead_id: lead.id,
      tip: 'review',
      telefon: lead.telefon,
      mesaj,
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : result.error,
    })
    if (result.ok) reviews.push(`${lead.prenume ?? ''} ${lead.nume}`.trim())
    else errors.push(`${lead.nume}: ${result.error}`)
  }

  console.log(
    `[cron/morning] remindere: ${sent.length}, review: ${reviews.length}, erori: ${errors.length}`,
  )
  return Response.json({ sent, reviews, errors, rulatLa: now.toISOString() })
})
