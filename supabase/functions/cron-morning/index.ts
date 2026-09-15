// Edge Function cron — dimineață, 10:00 ora României.
// Remindere programări, cu text adaptiv:
//    - Luni-Vineri → reminder "AZI" pentru programările zilei
//    - dacă mâine e Sâmbătă/Duminică → reminder "MAINE" (deci Vineri trimite
//      AZI + MAINE, Sâmbătă trimite doar MAINE pentru Duminică)
// Plus lista de sunat de luni și regula celor 50 de zile (email către manageri).
// Followup-ul, confirmarea înrolării și post_demo pleacă din cron-afternoon, la
// 16:00, când e cineva la sală să răspundă (decizie 2026-09-15).
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSms, sendSms } from '../_shared/sms.ts'
import {
  localDateBucharest,
  localHourBucharest,
  localWeekdayBucharest,
} from '../_shared/quietHours.ts'
import { leaduriProtejate } from '../_shared/leadNurture.ts'
import { sendEmail } from '../_shared/messaging.ts'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'

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
  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

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
  // Sursa de adevăr e PROGRAMAREA zilei (`programari_leads`), nu câmpurile de pe
  // lead. Motivul: o clasă demo se poate umple din rosterul evenimentului, iar
  // `inscrie_la_demo` nu mai întoarce leadul în „Programat" dacă e deja mai
  // departe în pipeline (a_venit) — corect pentru kanban, dar citirea veche
  // (`leads.status='programat'` + `leads.data_programare`) sărea peste el și
  // omul venea la demo fără reminder. La fel, un lead cu două programări avea
  // `data_programare` de pe cea mai nouă, nu de pe cea de azi.
  //
  // Ora și locația se iau din EVENIMENTUL/cursul programării, live la trimitere
  // (nu din copia stocată la înscriere, care rămâne veche dacă se mută ora), și
  // nu prin `getProgramareSms` — acela alege ultima programare a leadului, deci
  // pe cea greșită când sunt două.
  const dow = now.getUTCDay() // 0=Dum … 6=Sâm
  const targets: { day: Date; cand: 'azi' | 'maine' }[] = []
  if (dow >= 1 && dow <= 5) targets.push({ day: new Date(now), cand: 'azi' })
  const tomorrow = new Date(now.getTime() + 86_400_000)
  const tdow = tomorrow.getUTCDay()
  if (tdow === 6 || tdow === 0) targets.push({ day: tomorrow, cand: 'maine' })

  for (const t of targets) {
    const ziIso = localDateBucharest(t.day)

    // a) Programările zilei — curs SAU eveniment, indiferent de statusul leadului.
    const { data: programari } = await supabase
      .from('programari_leads')
      .select('lead, ora, locatie, eveniment_programat')
      .eq('prezenta', 'programat')
      .eq('data_programarii', ziIso)
      .not('lead', 'is', null)

    type Slot = {
      ora: string | null
      locatieId: string | null
      evenimentId: string | null
    }
    const sloturi = new Map<string, Slot>()
    for (const p of programari ?? []) {
      // Două programări în aceeași zi: prima e suficientă — mesajul e „azi ai
      // ședință", nu un orar.
      if (sloturi.has(p.lead as string)) continue
      sloturi.set(p.lead as string, {
        ora: p.ora ?? null,
        locatieId: p.locatie ?? null,
        evenimentId: p.eveniment_programat ?? null,
      })
    }

    // b) Compat: leaduri marcate „Programat" cu dată, dar fără rând de programare
    // (date vechi, dinainte ca programarea să fie obligatorie în LeadModal).
    const { data: fromLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('status', 'programat')
      .gte('data_programare', startOfDay(t.day))
      .lte('data_programare', endOfDay(t.day))
    for (const l of fromLeads ?? []) {
      if (!sloturi.has(l.id)) {
        sloturi.set(l.id, { ora: null, locatieId: null, evenimentId: null })
      }
    }

    const leadIds = [...sloturi.keys()]
    if (!leadIds.length) continue

    const { data: leads } = await supabase
      .from('leads')
      .select('id, prenume, nume, telefon, locatia')
      .in('id', leadIds)

    // Ora + locația reale ale evenimentelor din lot (o singură interogare).
    const evIds = [
      ...new Set(
        [...sloturi.values()]
          .map((s) => s.evenimentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const { data: evenimente } = evIds.length
      ? await supabase
          .from('evenimente')
          .select('id, ora, locatie_id, status')
          .in('id', evIds)
      : { data: [] }
    const evById = new Map(
      (evenimente ?? []).map((e) => [e.id as string, e]),
    )

    // Numele locațiilor (SMS-ul mapează adresa pe nume, nu pe id).
    const locIds = [
      ...new Set(
        [
          ...[...sloturi.values()].map((s) => s.locatieId),
          ...(evenimente ?? []).map((e) => e.locatie_id as string | null),
        ].filter((id): id is string => Boolean(id)),
      ),
    ]
    const { data: locatii } = locIds.length
      ? await supabase.from('locatii').select('id, nume').in('id', locIds)
      : { data: [] }
    const numeLocatie = new Map(
      (locatii ?? []).map((l) => [l.id as string, l.nume as string]),
    )

    // Dedup pe zi într-un singur query: `sms_logs` n-are unique pe (lead_id, tip),
    // deci `.maybeSingle()` per lead crăpa pe orice dublură veche și trimitea din nou.
    const { data: dejaTrimise } = await supabase
      .from('sms_logs')
      .select('lead_id')
      .in('lead_id', leadIds)
      .eq('tip', 'reminder')
      .eq('status', 'sent')
      .gte('trimis_la', startOfDay(now))
    const auPrimit = new Set(
      (dejaTrimise ?? []).map((r) => r.lead_id as string),
    )

    for (const lead of leads ?? []) {
      if (!lead.telefon) continue
      if (auPrimit.has(lead.id)) continue
      // NB: `deja_client` NU exclude aici. Flagul scoate leadul din fluxul RECE
      // (prospectare), dar reminderul e operațional — omul chiar are un loc
      // rezervat azi. La fel se comporta și înainte de trecerea pe programări.

      const slot = sloturi.get(lead.id)!
      const ev = slot.evenimentId ? evById.get(slot.evenimentId) : null
      // Evenimentul anulat nu mai are reminder — omul n-are unde veni.
      if (ev?.status === 'Anulat') continue

      const ora = ev?.ora ?? slot.ora ?? null
      const locatieId = ev?.locatie_id ?? slot.locatieId ?? null
      const locatie = locatieId
        ? (numeLocatie.get(locatieId) ?? lead.locatia)
        : lead.locatia

      const mesaj = buildSms('reminder', {
        prenume: lead.prenume || lead.nume,
        locatie,
        dataProgramare: ziIso,
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
      auPrimit.add(lead.id)
      if (result.ok) sent.push(`${lead.prenume ?? ''} ${lead.nume}`.trim())
      else errors.push(`${lead.nume}: ${result.error}`)
    }
  }

  // --- 2. Lista de sunat de LUNI: demo-uri neconvertite (a_venit) ---
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
      .select('id, id_client, flag_reminder, flag_streak, flag_reminder_at')
      .eq('status', 'a_venit')
      .eq('deja_client', false)

    // Cine a venit la demo ȘI e deja client activ rămâne flagat, dar nu iese
    // din pipeline: e o conversie neînregistrată, nu un lead de abandonat.
    const protejate = await leaduriProtejate(supabase, aVenit ?? [])

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
        if (streak >= 2 && !protejate.has(l.id)) {
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
    `[cron/morning] remindere: ${sent.length}, aVenitFlag: ${aVenitFlagged}, aVenitNurture: ${aVenitNurtured}, suspendati50z: ${suspendati}, emailuri: ${emailuriTrimise}, erori: ${errors.length}`,
  )
  return Response.json({
    sent,
    aVenitFlagged,
    aVenitNurtured,
    suspendati50z: suspendati,
    emailuriSuspendari: emailuriTrimise,
    errors,
    rulatLa: now.toISOString(),
  })
})
