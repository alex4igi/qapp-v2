// Edge Function cron — dimineață.
// Remindere programări, cu text adaptiv:
//    - Luni-Vineri → reminder "AZI" pentru programările zilei
//    - dacă mâine e Sâmbătă/Duminică → reminder "MAINE" (deci Vineri trimite
//      AZI + MAINE, Sâmbătă trimite doar MAINE pentru Duminică)
// NB: review-ul NU se mai trimite aici (decizie 2026-06-08) — se cere doar după
// conversie (lead → client). Vezi scripts/sms/templates.md → De implementat #1.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  buildConfirmareInrolareSms,
  buildSms,
  sendSms,
} from '../_shared/sms.ts'
import { getProgramareSms } from '../_shared/leadLocatie.ts'
import { sendEmail } from '../_shared/messaging.ts'

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

// Ziua săptămânii în fus București (Mon..Sun) — pentru lista de sunat de luni.
function localWeekdayBucharest(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Bucharest',
    weekday: 'short',
  }).format(d)
}


// Regula „50 de zile" (2026-08-31): cine depășește cu 50 de zile termenul unei
// rate DIN SEZONUL LUI e suspendat automat (nu mai intră la ore, nu mai rezervă)
// și managerul primește pe email lista, ca să confirme anularea locului din
// /datorii. Rezilierea rămâne act de om — e ireversibilă și zeroizează lunile
// viitoare. Vezi docs/reguli-preturi-reduceri.md.
type SuspendatRow = {
  client_id: string
  nume: string | null
  prenume: string | null
  zile_depasire: number | null
  rest: number | null
  cursuri: string | null
}

const APP_URL = Deno.env.get('APP_URL') ?? 'https://qapp.quasardance.ro'

// Destinatarii = conturile de staff cu rol de decizie. Lista se întreține singură:
// cine devine manager primește emailul, fără configurare separată.
async function getManagerEmails(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) throw error
  const roluri = new Set(['owner', 'admin', 'manager'])
  return (data?.users ?? [])
    .filter((u) => roluri.has(String(u.app_metadata?.role ?? '')))
    .map((u) => u.email)
    .filter((e): e is string => Boolean(e))
}

function buildSuspendariEmail(rows: SuspendatRow[]): { subject: string; html: string; text: string } {
  const linii = rows.map((r) => {
    const nume = `${r.nume ?? ''} ${r.prenume ?? ''}`.trim() || 'Client fără nume'
    return {
      nume,
      zile: r.zile_depasire ?? 0,
      rest: Math.round(Number(r.rest ?? 0)),
      cursuri: r.cursuri ?? '—',
    }
  })
  const n = linii.length
  const subject =
    n === 1
      ? `Quasar: 1 cursant a depășit 50 de zile — locul e de anulat`
      : `Quasar: ${n} cursanți au depășit 50 de zile — locurile sunt de anulat`

  const rowsHtml = linii
    .map(
      (l) =>
        `<tr><td style="padding:6px 12px 6px 0">${l.nume}</td>` +
        `<td style="padding:6px 12px 6px 0">${l.cursuri}</td>` +
        `<td style="padding:6px 12px 6px 0;text-align:right">${l.zile} zile</td>` +
        `<td style="padding:6px 0;text-align:right"><strong>${l.rest} RON</strong></td></tr>`,
    )
    .join('')

  const html =
    `<p>Următorii cursanți au depășit cu peste 50 de zile termenul unei rate din sezonul curent. ` +
    `Accesul lor a fost <strong>suspendat automat</strong> (nu mai pot intra la ore și nu mai pot rezerva).</p>` +
    `<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px">${rowsHtml}</table>` +
    `<p>Anularea locului în grupă nu s-a făcut automat — o confirmi tu din ` +
    `<a href="${APP_URL}/datorii">pagina Datorii</a>. La reziliere, prețul promo se încheie odată cu locul.</p>` +
    `<p style="color:#666;font-size:12px">Mesaj automat Qapp. Dacă rata se achită între timp, reactivează clientul tot din Datorii.</p>`

  const text =
    `Au depasit 50 de zile de la termenul unei rate din sezonul curent si au fost suspendati automat:\n\n` +
    linii.map((l) => `- ${l.nume} (${l.cursuri}) - ${l.zile} zile, ${l.rest} RON`).join('\n') +
    `\n\nAnularea locului o confirmi din ${APP_URL}/datorii. La reziliere, pretul promo se incheie odata cu locul.`

  return { subject, html, text }
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

      // Ora + locația din ultima programare (rezolvate din curs/eveniment);
      // lead.locatia e doar fallback.
      const { ora, locatie } = await getProgramareSms(
        supabase,
        lead.id,
        lead.locatia,
      )

      const mesaj = buildSms('reminder', {
        prenume: lead.prenume || lead.nume,
        locatie,
        dataProgramare: lead.data_programare,
        ora,
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

  // --- 2. Follow-up pentru no-show mutați automat ---
  // La marcarea MANUALĂ „nu a venit" followup-ul pleacă pe loc (triggerLeadSms).
  // Dar cron-evening / prune_expired_leads mută programat → nu_a_venit fără SMS.
  // Aici, a doua zi, trimitem followup celor mutați recent. Fereastra de 2 zile
  // rezistă la o rulare ratată a cronului; dedup pe sms_logs (tip='followup',
  // lifetime) sare peste cei deja notificați manual sau într-o rulare anterioară.
  // Decizie 2026-07-01: trimitem și celor auto-mutați (anula respingerea 2026-06-10).
  let followupSent = 0
  const cutoffFollowup = new Date(now.getTime() - 2 * 86_400_000).toISOString()
  const { data: noShows } = await supabase
    .from('leads')
    .select('id, prenume, nume, telefon, locatia, data_programare, nr_neprezentari')
    .eq('status', 'nu_a_venit')
    .eq('deja_client', false)
    .gte('updated', cutoffFollowup)

  for (const lead of noShows ?? []) {
    if (!lead.telefon) continue
    // A 2-a neprezentare nu primește followup (e rutată în nurture oricum).
    if ((lead.nr_neprezentari ?? 0) >= 2) continue

    const { data: existing } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('tip', 'followup')
      .maybeSingle()
    if (existing) continue

    const { locatie } = await getProgramareSms(supabase, lead.id, lead.locatia)
    const mesaj = buildSms('followup', {
      prenume: lead.prenume || lead.nume,
      locatie,
    })

    const result = await sendSms(lead.telefon, mesaj)
    if (result.ok) {
      await supabase.from('sms_logs').insert({
        lead_id: lead.id,
        tip: 'followup',
        telefon: lead.telefon,
        mesaj,
      })
      followupSent++
    } else {
      errors.push(`${lead.nume} (followup): ${result.error}`)
    }
  }

  // --- 3. Confirmări înrolare recurentă (a doua zi) ---
  // Coada `confirmari_inrolare_sms` e alimentată la crearea înrolării; aici, la
  // cronul de dimineață, trimitem rândurile scadente (send_after <= acum) dacă
  // înrolarea e încă activă. Ștearsă în interval (greșeală) → rândul a dispărut
  // prin ON DELETE CASCADE; reziliată/inactivă → 'anulat' fără SMS.
  let confirmariSent = 0
  const { data: dueConfirmari } = await supabase
    .from('confirmari_inrolare_sms')
    .select('id, enrollment_id')
    .eq('status', 'programat')
    .lte('send_after', now.toISOString())

  for (const row of dueConfirmari ?? []) {
    const { data: enr } = await supabase
      .from('enrollments')
      .select('id, activ, reziliat, client, cursul')
      .eq('id', row.enrollment_id)
      .maybeSingle()
    if (!enr || enr.reziliat || !enr.activ || !enr.cursul || !enr.client) {
      await supabase
        .from('confirmari_inrolare_sms')
        .update({ status: 'anulat' })
        .eq('id', row.id)
      continue
    }

    const { data: curs } = await supabase
      .from('cursuri')
      .select('id, numele, zile, ora, ore_pe_zi, pret_lunar, pret_anual, teacher, link_whatsapp')
      .eq('id', enr.cursul)
      .maybeSingle()
    const { data: client } = await supabase
      .from('clienti')
      .select('prenume, nume, telefon')
      .eq('id', enr.client)
      .maybeSingle()
    if (!curs || !client?.telefon) {
      await supabase
        .from('confirmari_inrolare_sms')
        .update({ status: 'anulat', error: 'curs sau telefon lipsa' })
        .eq('id', row.id)
      continue
    }

    // Instructor titular: M:N (rol='titular'), fallback pe coloana legacy.
    let teacherId = curs.teacher
    const { data: ct } = await supabase
      .from('cursuri_teacheri')
      .select('teacher_id, rol')
      .eq('curs_id', curs.id)
    const titular = ct?.find((r) => r.rol === 'titular') ?? ct?.[0]
    if (titular) teacherId = titular.teacher_id
    let instructor: string | null = null
    if (teacherId) {
      const { data: t } = await supabase
        .from('teacheri')
        .select('prenume, nume')
        .eq('id', teacherId)
        .maybeSingle()
      instructor = [t?.prenume, t?.nume].filter(Boolean).join(' ') || null
    }

    const pretLunar =
      curs.pret_lunar ??
      (curs.pret_anual != null ? Math.round(curs.pret_anual / 10) : null)
    const mesaj = buildConfirmareInrolareSms({
      prenume: client.prenume || client.nume,
      curs: curs.numele,
      zile: curs.zile,
      ora: curs.ora,
      orePeZi: curs.ore_pe_zi as Record<string, string> | null,
      instructor,
      pretLunar,
      linkWhatsapp: curs.link_whatsapp,
    })

    const result = await sendSms(client.telefon, mesaj)
    await supabase
      .from('confirmari_inrolare_sms')
      .update(
        result.ok
          ? {
              status: 'trimis',
              trimis_la: now.toISOString(),
              telefon: client.telefon,
              mesaj,
            }
          : {
              status: 'esuat',
              telefon: client.telefon,
              mesaj,
              error: result.error ?? 'eroare necunoscuta',
            },
      )
      .eq('id', row.id)
    if (result.ok) confirmariSent++
  }

  // --- 4. Lista de sunat de LUNI: demo-uri neconvertite (a_venit) ---
  // Cadență săptămânală: leadfii care au fost la demo și n-au convertit primesc
  // flag de prioritate lunea dimineața → apar pe „De lucrat azi" (steag roșu),
  // ca recepția să-i sune. Un demo de marți primește flagul lunea următoare.
  // Escaladare (regula generală): al 2-lea flag ignorat (flag_streak >= 2) →
  // auto-Nurture. Recepția nu are buton „am sunat"; flagul se șterge doar la
  // schimbarea statusului (conversie / mutare). Rulat DOAR aici (nu în
  // cron-evening) ca să nu se flagheze zilnic.
  let aVenitFlagged = 0
  let aVenitNurtured = 0
  if (localWeekdayBucharest(now) === 'Mon') {
    // „Flag ignorat un ciclu" = stamp de la o luni anterioară. Rulările sunt la
    // ~7 zile distanță, deci pragul de 2 zile separă clar un flag proaspăt de
    // unul vechi (parcurge regula existentă din cron-evening).
    const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000).toISOString()
    const { data: aVenit } = await supabase
      .from('leads')
      .select('id, flag_reminder, flag_streak, flag_reminder_at')
      .eq('status', 'a_venit')
      .eq('deja_client', false)

    for (const l of aVenit ?? []) {
      if (!l.flag_reminder) {
        // Primul flag (prima luni după demo).
        const { error } = await supabase
          .from('leads')
          .update({
            flag_reminder: true,
            flag_streak: 1,
            flag_reminder_at: now.toISOString(),
          })
          .eq('id', l.id)
        if (!error) aVenitFlagged++
        else errors.push(`a_venit flag ${l.id}: ${error.message}`)
      } else if ((l.flag_reminder_at ?? '') < twoDaysAgo) {
        // Flag ignorat un ciclu întreg → escaladează.
        const streak = (l.flag_streak ?? 1) + 1
        if (streak >= 2) {
          const { error } = await supabase
            .from('leads')
            .update({
              status: 'nurture',
              sub_status: null,
              flag_reminder: false,
              flag_streak: 0,
              flag_reminder_at: null,
            })
            .eq('id', l.id)
          if (!error) aVenitNurtured++
          else errors.push(`a_venit nurture ${l.id}: ${error.message}`)
        } else {
          const { error } = await supabase
            .from('leads')
            .update({ flag_streak: streak, flag_reminder_at: now.toISOString() })
            .eq('id', l.id)
          if (!error) aVenitFlagged++
          else errors.push(`a_venit streak ${l.id}: ${error.message}`)
        }
      }
    }
  }

  // --- Regula 50 de zile: suspendare automată + email către manageri ---
  let suspendati = 0
  let emailuriTrimise = 0
  {
    const { data: rows, error } = await supabase.rpc('suspenda_datornici_50_zile')
    if (error) {
      errors.push(`suspendare 50 zile: ${error.message}`)
    } else {
      const lista = (rows ?? []) as SuspendatRow[]
      suspendati = lista.length
      // Fără suspendări noi nu trimitem nimic — managerul nu primește zilnic un
      // email gol, altfel învață să le ignore exact când contează.
      if (lista.length > 0) {
        try {
          const destinatari = await getManagerEmails(supabase)
          if (destinatari.length === 0) {
            errors.push('suspendare 50 zile: niciun cont cu rol owner/admin/manager')
          }
          const { subject, html, text } = buildSuspendariEmail(lista)
          for (const to of destinatari) {
            const res = await sendEmail({ to, subject, html, text })
            if (res.ok) emailuriTrimise++
            else errors.push(`email suspendari → ${to}: ${res.error ?? 'eșec'}`)
          }
        } catch (e) {
          errors.push(`email suspendari: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }

  console.log(
    `[cron/morning] remindere: ${sent.length}, followup: ${followupSent}, confirmari: ${confirmariSent}, aVenitFlag: ${aVenitFlagged}, aVenitNurture: ${aVenitNurtured}, suspendati50z: ${suspendati}, emailuri: ${emailuriTrimise}, erori: ${errors.length}`,
  )
  return Response.json({
    sent,
    followup: followupSent,
    confirmari: confirmariSent,
    aVenitFlagged,
    aVenitNurtured,
    suspendati50z: suspendati,
    emailuriSuspendari: emailuriTrimise,
    errors,
    rulatLa: now.toISOString(),
  })
})
