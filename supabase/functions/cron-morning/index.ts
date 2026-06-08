// Edge Function cron — dimineață.
// Remindere programări, cu text adaptiv:
//    - Luni-Vineri → reminder "AZI" pentru programările zilei
//    - dacă mâine e Sâmbătă/Duminică → reminder "MAINE" (deci Vineri trimite
//      AZI + MAINE, Sâmbătă trimite doar MAINE pentru Duminică)
// NB: review-ul NU se mai trimite aici (decizie 2026-06-08) — se cere doar după
// conversie (lead → client). Vezi scripts/sms/templates.md → De implementat #1.
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

// Ora locală țintă pentru reminder (Europe/Bucharest). pg_cron e programat la
// AMBELE ore UTC (07:00 + 08:00); garda de mai jos lasă să ruleze o singură dată,
// la 10:00 local, imun la ora de vară/iarnă. Override via env REMINDER_HOUR_LOCAL.
const TARGET_HOUR_LOCAL = Number(Deno.env.get('REMINDER_HOUR_LOCAL') ?? '10')

function localHourBucharest(d: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Bucharest',
      hour: '2-digit',
      hour12: false,
    }).format(d),
  )
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Rulează o singură dată pe zi, la ora locală țintă (10:00). Cealaltă invocare
  // UTC (sezonul opus) cade pe altă oră locală și iese aici fără efect.
  const localHour = localHourBucharest(new Date())
  if (localHour !== TARGET_HOUR_LOCAL) {
    return Response.json({
      skipped: true,
      reason: `ora locala ${localHour}:00 != ${TARGET_HOUR_LOCAL}:00`,
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const now = new Date()
  const sent: string[] = []
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

  // NB: review-ul NU se mai trimite după prezența la demo. Decizie 2026-06-08:
  // review-ul se cere DOAR după conversie (lead mutat în client) — de implementat
  // separat (vezi scripts/sms/templates.md → De implementat #1).

  console.log(
    `[cron/morning] remindere: ${sent.length}, erori: ${errors.length}`,
  )
  return Response.json({ sent, errors, rulatLa: now.toISOString() })
})
