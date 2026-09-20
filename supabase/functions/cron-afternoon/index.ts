// Edge Function cron — după-amiază, 16:00 ora României, luni–vineri.
// SMS-urile la care omul poate vrea să ne răspundă pleacă atunci când e cineva la
// sală să preia telefonul (decizie Alex, 15.09.2026). Până atunci plecau din
// cron-morning la 10:00, când nu răspundea nimeni.
//   1. confirmarea înrolării recurente, a doua zi
//   2. post_demo — la 2–4 zile după demo, pentru cine n-a mai venit să se înscrie
// Aici pleca și „ne pare rău că nu ai ajuns", la prima neprezentare. Scos pe
// 19.09.2026: neprezentarea se lucrează la telefon, nu prin SMS (vezi
// docs/procedura-leads-kanban.md).
// Sâmbăta și duminica nu pleacă nimic de aici: tot ce se strânge în weekend iese
// luni la 16:00. Reminderul ședinței rămâne dimineața, în cron-morning.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  buildConfirmareInrolareSms,
  buildSms,
  sendSms,
} from '../_shared/sms.ts'
import { getProgramareSms } from '../_shared/leadLocatie.ts'
import {
  localDateBucharest,
  localHourBucharest,
  localWeekdayBucharest,
} from '../_shared/quietHours.ts'
import { leaduriProtejate } from '../_shared/leadNurture.ts'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'

// pg_cron e programat la AMBELE ore UTC (13:00 + 14:00); garda lasă să ruleze o
// singură dată, la 16:00 local, imun la ora de vară/iarnă.
const ORA_SALA_LOCAL = 16

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

Deno.serve(async (req) => {
  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

  const now = new Date()
  const localHour = localHourBucharest(now)
  if (localHour !== ORA_SALA_LOCAL) {
    return Response.json({
      skipped: true,
      reason: `ora locala ${localHour}:00 != ${ORA_SALA_LOCAL}:00`,
    })
  }
  const zi = localWeekdayBucharest(now)
  if (zi === 'Sat' || zi === 'Sun') {
    return Response.json({ skipped: true, reason: 'weekend — pleaca luni' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const errors: string[] = []

  // --- 1. Confirmări înrolare recurentă (a doua zi) ---
  // Coada `confirmari_inrolare_sms` e alimentată la crearea înrolării (send_after =
  // mâine 00:00 local); aici trimitem rândurile scadente dacă înrolarea e încă
  // activă. Ștearsă în interval (greșeală) → rândul a dispărut prin ON DELETE
  // CASCADE; reziliată/inactivă → 'anulat' fără SMS.
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

  // --- 3. Reminder la 2 zile după demo (a_venit, încă neînscris) ---
  // Cine a venit la ședința de probă și nu s-a înscris primea până acum ZERO
  // automatisme — prima atingere era abia flagul de luni (până la 6 zile de
  // tăcere, exact intervalul în care omul e cel mai cald).
  //
  // Ora vine din cronul ăsta, nu dintr-un delay de 48h care ar cădea oricând —
  // inclusiv seara, în fereastra quiet hours.
  //
  // Fereastra de 2-4 zile (nu fix D-2) acoperă weekendul: un demo de joi are D-2
  // sâmbătă și primește mesajul luni (D-4). Dedup pe sms_logs (tip='post_demo',
  // pe viață) oprește dublurile. Lunea mesajul pleacă odată cu apelurile
  // recepției de pe lista de sunat.
  //
  // NU scriem în `lead_contacte`: acolo ORICE rând stinge flag_reminder
  // (trigger bump_lead_ultima_contactare, migrația 20260901210000), deci un SMS
  // automat ar șterge leadul de pe lista de sunat de luni. Automatul e prima
  // atingere; apelul omului rămâne a doua.
  let postDemoSent = 0
  {
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
    // `post_demo` e MARKETING (vezi _shared/smsCategorie.ts): cine a cerut opt-out
    // nu-l primește. Gardul e aici, în interogare, nu la trimitere — un lead cu
    // opt-out nu trebuie nici măcar să consume dedupul din `sms_logs`.
    const { data: candidati } = leadIds.length
      ? await supabase
          .from('leads')
          .select('id, prenume, nume, telefon, locatia, id_client')
          .in('id', leadIds)
          .eq('status', 'a_venit')
          .eq('deja_client', false)
          .eq('opt_out_marketing', false)
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
      // șansă a leadului — se reîncearcă la rularea următoare, cât e în fereastră.
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

  console.log(
    `[cron/afternoon] confirmari: ${confirmariSent}, postDemo: ${postDemoSent}, erori: ${errors.length}`,
  )
  return Response.json({
    confirmari: confirmariSent,
    postDemo: postDemoSent,
    errors,
    rulatLa: now.toISOString(),
  })
})
