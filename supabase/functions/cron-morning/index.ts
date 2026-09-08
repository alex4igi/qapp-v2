// Edge Function cron — dimineață.
// Remindere programări, cu text adaptiv:
//    - Luni-Vineri → reminder "AZI" pentru programările zilei
//    - dacă mâine e Sâmbătă/Duminică → reminder "MAINE" (deci Vineri trimite
//      AZI + MAINE, Sâmbătă trimite doar MAINE pentru Duminică)
// NB: review-ul NU se mai trimite aici (decizie 2026-06-08) — se cere doar după
// conversie (lead → client). Vezi scripts/sms/templates.md → De implementat #1.
// Pasul 5: reminder la 2 zile după demo pentru cine a venit și nu s-a înscris
// (a_venit). Sâmbăta se trimite, duminica nu — cade luni.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  buildConfirmareInrolareSms,
  buildSms,
  sendSms,
} from '../_shared/sms.ts'
import { getProgramareSms } from '../_shared/leadLocatie.ts'
import { localDateBucharest } from '../_shared/quietHours.ts'
import { leaduriProtejate } from '../_shared/leadNurture.ts'
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
// Rata lunară din SMS-ul de confirmare = ce plătește CLIENTUL, nu prețul de
// catalog al cursului: promo de reînscriere, −10% pe pool și voucherul stau pe
// rândurile din `enrollments` (`suma`), nu pe `cursuri`. Rândul din coadă e prima
// lună, care poate fi prorata la înscriere târzie — de aia luăm rata care se
// REPETĂ peste luni (mode), nu suma rândului. Vezi docs/reguli-preturi-reduceri.md.
function rataCareSeRepeta(sume: (number | null)[]): number | null {
  const valide = sume
    .map((s) => Number(s ?? 0))
    .filter((s) => Number.isFinite(s) && s > 0)
  if (!valide.length) return null
  const freq = new Map<number, number>()
  for (const s of valide) freq.set(s, (freq.get(s) ?? 0) + 1)
  let best = valide[0]
  let bestN = 0
  for (const [suma, n] of freq) {
    // La egalitate de frecvență ia rata mai mare: prorata e mereu <= rata plină.
    if (n > bestN || (n === bestN && suma > best)) {
      best = suma
      bestN = n
    }
  }
  return Math.round(best)
}

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
      .select('id, activ, reziliat, client, cursul, tip_plata, data_incepere, suma')
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

    let pretLunar: number | null = null
    if (enr.tip_plata === 'Per an') {
      // Plata integrală = un singur rând pe sezon; sezonul are 10 rate prin
      // convenție (pret_anual = 10 × rată), deci rata lunară e suma / 10.
      pretLunar = enr.suma != null ? Math.round(Number(enr.suma) / 10) : null
    } else {
      const { data: rate } = await supabase
        .from('enrollments')
        .select('suma, suma_baza, activ, reziliat')
        .eq('client', enr.client)
        .eq('cursul', enr.cursul)
        .eq('tip_plata', 'Per luna')
        .gte('data_incepere', enr.data_incepere ?? '0001-01-01')
      const vii = (rate ?? []).filter((r) => r.activ && !r.reziliat)
      pretLunar =
        rataCareSeRepeta(vii.map((r) => r.suma)) ??
        rataCareSeRepeta(vii.map((r) => r.suma_baza))
    }
    // Fallback pe prețul de catalog doar dacă rândurile n-au sumă (date vechi).
    if (pretLunar == null) {
      pretLunar =
        curs.pret_lunar ??
        (curs.pret_anual != null ? Math.round(curs.pret_anual / 10) : null)
    }
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

  // --- 5. Reminder la 2 zile după demo (a_venit, încă neînscris) ---
  // Cine a venit la ședința de probă și nu s-a înscris primea până acum ZERO
  // automatisme — prima atingere era abia flagul de luni (până la 6 zile de
  // tăcere, exact intervalul în care omul e cel mai cald).
  //
  // Ora vine din cronul ăsta (10:00 local), nu dintr-un delay de 48h care ar
  // cădea oricând — inclusiv seara, în fereastra quiet hours. Practic 40-64h.
  //
  // Fereastra de 2-4 zile (nu fix D-2) e auto-vindecătoare: o rulare ratată e
  // recuperată a doua zi, iar dedup-ul pe sms_logs (tip='post_demo', pe viață)
  // oprește dublurile. Duminica se sare cu totul: mesajele cad luni, în aceeași
  // zi cu lista de sunat — SMS la 10:00, telefonul recepției după.
  //
  // NU scriem în `lead_contacte`: acolo ORICE rând stinge flag_reminder
  // (trigger bump_lead_ultima_contactare, migrația 20260901210000), deci un SMS
  // automat ar șterge leadul de pe lista de sunat de luni. Automatul e prima
  // atingere; apelul omului rămâne a doua.
  let postDemoSent = 0
  if (localWeekdayBucharest(now) !== 'Sun') {
    const ziLocala = (zileInUrma: number) =>
      localDateBucharest(new Date(now.getTime() - zileInUrma * 86_400_000))

    const { data: prezenteDemo } = await supabase
      .from('programari_leads')
      .select('lead')
      .eq('prezenta', 'prezent')
      .gte('data_programarii', ziLocala(4))
      .lte('data_programarii', ziLocala(2))
      .not('lead', 'is', null)

    const leadIds = [...new Set((prezenteDemo ?? []).map((p) => p.lead as string))]
    const { data: candidati } = leadIds.length
      ? await supabase
          .from('leads')
          .select('id, prenume, nume, telefon, locatia, id_client')
          .in('id', leadIds)
          .eq('status', 'a_venit')
          .eq('deja_client', false)
      : { data: [] }

    if ((candidati ?? []).length) {
      const ids = (candidati ?? []).map((l) => l.id)
      // Lead legat de un client încă Activ/Inactiv = conversie neînregistrată.
      // I-am cere să se înscrie a doua oară.
      const protejate = await leaduriProtejate(supabase, candidati ?? [])
      // Cine și-a luat deja altă ședință nu primește „păstrează-ți locul".
      const { data: cuViitor } = await supabase
        .from('programari_leads')
        .select('lead')
        .in('lead', ids)
        .gte('data_programarii', localDateBucharest(now))
      const auViitor = new Set((cuViitor ?? []).map((p) => p.lead as string))
      // Dedup într-un singur query, nu unul per lead: `sms_logs` n-are unique pe
      // (lead_id, tip), deci un `.maybeSingle()` ar crăpa pe orice dublură veche.
      // Numără doar 'sent': un eșec de provider nu are voie să consume unica
      // șansă a leadului — se reîncearcă mâine, cât timp e în fereastră.
      const { data: deja } = await supabase
        .from('sms_logs')
        .select('lead_id')
        .eq('tip', 'post_demo')
        .eq('status', 'sent')
        .in('lead_id', ids)
      const auPrimit = new Set((deja ?? []).map((r) => r.lead_id as string))

      for (const lead of candidati ?? []) {
        if (!lead.telefon) continue
        if (protejate.has(lead.id) || auViitor.has(lead.id)) continue
        if (auPrimit.has(lead.id)) continue

        const { locatie } = await getProgramareSms(supabase, lead.id, lead.locatia)
        const mesaj = buildSms('post_demo', {
          prenume: lead.prenume || lead.nume,
          locatie,
        })

        const result = await sendSms(lead.telefon, mesaj)
        await supabase.from('sms_logs').insert({
          lead_id: lead.id,
          tip: 'post_demo',
          telefon: lead.telefon,
          mesaj,
          status: result.ok ? 'sent' : 'failed',
          error: result.ok ? null : result.error,
        })
        if (result.ok) postDemoSent++
        else errors.push(`${lead.nume} (post_demo): ${result.error}`)
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
    `[cron/morning] remindere: ${sent.length}, followup: ${followupSent}, postDemo: ${postDemoSent}, confirmari: ${confirmariSent}, aVenitFlag: ${aVenitFlagged}, aVenitNurture: ${aVenitNurtured}, suspendati50z: ${suspendati}, emailuri: ${emailuriTrimise}, erori: ${errors.length}`,
  )
  return Response.json({
    sent,
    followup: followupSent,
    postDemo: postDemoSent,
    confirmari: confirmariSent,
    aVenitFlagged,
    aVenitNurtured,
    suspendati50z: suspendati,
    emailuriSuspendari: emailuriTrimise,
    errors,
    rulatLa: now.toISOString(),
  })
})
