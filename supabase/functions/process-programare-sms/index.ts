// Edge Function cron — drenează coada `confirmari_programare_sms`.
// Pentru fiecare rând scadent (send_after <= now, status 'programat'):
//   - reciteste PROGRAMAREA (nu statusul leadului),
//   - daca programarea a disparut sau nu mai e 'programat' → 'anulat' (fara SMS),
//   - altfel compune confirmarea (data + ora + adresa evenimentului/cursului),
//   - dedup prin sms_logs pe (lead_id, tip='confirmare', programare) si pe text,
//   - o citire esuata (timeout, 5xx) lasa randul in coada pentru rularea urmatoare.
// Apelata de pg_cron la ~1 min. Delay-ul de 2 min vine din send_after.
//
// De ce programarea si nu `leads.status`: inscrierea la o clasa demo din rosterul
// evenimentului nu readuce leadul in „Programat" daca e deja mai departe in
// pipeline (a_venit) — omul ramanea fara confirmare desi era pe lista. Fereastra
// de undo ramane: rândul din coada are ON DELETE CASCADE pe programare, deci
// scoaterea de pe lista in cele 2 minute opreste SMS-ul.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildSms, sendSms } from '../_shared/sms.ts'
import { deferUntil, getQuietHoursConfig, isQuiet } from '../_shared/quietHours.ts'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'

Deno.serve(async (req) => {
  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

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
    .select('id, lead_id, programare')
    .eq('status', 'programat')
    .lte('send_after', nowIso)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  let sent = 0
  let canceled = 0
  let failed = 0
  // O citire esuata NU inseamna „programare disparuta": pe 14.09 un 504 la
  // citirea programarii a anulat definitiv confirmarea unui lead programat.
  let reincercari = 0

  const anuleaza = async (id: string, motiv?: string) => {
    await supabase
      .from('confirmari_programare_sms')
      .update({ status: 'anulat', error: motiv ?? null })
      .eq('id', id)
    canceled++
  }

  for (const row of due ?? []) {
    // Rânduri legacy (înainte de coloana `programare`): rezolvă programarea vie.
    let programareId = row.programare as string | null
    if (!programareId) {
      const { data: p, error: pErr } = await supabase
        .from('programari_leads')
        .select('id')
        .eq('lead', row.lead_id)
        .eq('prezenta', 'programat')
        .gte('data_programarii', new Date().toISOString().slice(0, 10))
        .order('created', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (pErr) {
        reincercari++
        continue
      }
      programareId = p?.id ?? null
    }
    if (!programareId) {
      await anuleaza(row.id, 'fără programare activă')
      continue
    }

    const { data: programare, error: progErr } = await supabase
      .from('programari_leads')
      .select('id, lead, data_programarii, ora, locatie, eveniment_programat, prezenta')
      .eq('id', programareId)
      .maybeSingle()
    if (progErr) {
      reincercari++
      continue
    }

    // Programare ștearsă sau deja consumată (prezent/absent) → fără SMS.
    if (!programare || programare.prezenta !== 'programat' || !programare.data_programarii) {
      await anuleaza(row.id, 'programare anulată sau consumată')
      continue
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, prenume, nume, telefon, locatia')
      .eq('id', row.lead_id)
      .maybeSingle()
    if (leadErr) {
      reincercari++
      continue
    }
    if (!lead) {
      await anuleaza(row.id, 'lead inexistent')
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

    // Dedup pe (lead, tip, programare): o re-editare în fereastră nu retrimite
    // pentru aceeași programare, dar o programare NOUĂ primește confirmarea ei.
    // Fără `.maybeSingle()` — `sms_logs` n-are unique, iar două rânduri vechi ar
    // face apelul să crape și SMS-ul să plece a doua oară.
    const { data: existing, error: dedupErr } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('tip', 'confirmare')
      .eq('programare', programare.id)
      .limit(1)
    if (dedupErr) {
      reincercari++
      continue
    }
    if ((existing ?? []).length) {
      await supabase
        .from('confirmari_programare_sms')
        .update({ status: 'trimis', trimis_la: new Date().toISOString() })
        .eq('id', row.id)
      continue
    }

    // Ora și locația vin din evenimentul/cursul programării, citite LIVE — copia
    // din `programari_leads` rămâne veche dacă se mută ora clasei demo.
    let ora = programare.ora as string | null
    let locatieId = programare.locatie as string | null
    if (programare.eveniment_programat) {
      const { data: ev, error: evErr } = await supabase
        .from('evenimente')
        .select('ora, locatie_id, status')
        .eq('id', programare.eveniment_programat)
        .maybeSingle()
      if (evErr) {
        reincercari++
        continue
      }
      if (ev?.status === 'Anulat') {
        await anuleaza(row.id, 'eveniment anulat')
        continue
      }
      ora = ev?.ora ?? ora
      locatieId = ev?.locatie_id ?? locatieId
    }

    let locatie = lead.locatia as string | null
    if (locatieId) {
      const { data: loc, error: locErr } = await supabase
        .from('locatii')
        .select('nume')
        .eq('id', locatieId)
        .maybeSingle()
      if (locErr) {
        reincercari++
        continue
      }
      locatie = loc?.nume ?? locatie
    }

    const mesaj = buildSms('confirmare', {
      prenume: lead.prenume || lead.nume,
      locatie,
      dataProgramare: programare.data_programarii,
      ora,
    })

    // Același text deja trimis = aceeași zi, oră și adresă. Se întâmplă când
    // leadul iese din „Programat" și revine: salvarea creează o programare nouă,
    // dedupul pe programare de mai sus o vede ca nouă, iar omul primea încă o
    // confirmare identică. Fereastra de 60 de zile ține separată o programare pe
    // aceeași dată calendaristică dintr-un sezon viitor.
    const { data: identic, error: identicErr } = await supabase
      .from('sms_logs')
      .select('id')
      .eq('lead_id', lead.id)
      .eq('tip', 'confirmare')
      .eq('mesaj', mesaj)
      .gte('trimis_la', new Date(Date.now() - 60 * 86_400_000).toISOString())
      .limit(1)
    if (identicErr) {
      reincercari++
      continue
    }
    if ((identic ?? []).length) {
      await supabase
        .from('confirmari_programare_sms')
        .update({ status: 'trimis', trimis_la: new Date().toISOString(), error: 'text identic deja trimis' })
        .eq('id', row.id)
      continue
    }

    const result = await sendSms(lead.telefon, mesaj)
    if (result.ok) {
      await supabase.from('sms_logs').insert({
        lead_id: lead.id,
        tip: 'confirmare',
        telefon: lead.telefon,
        mesaj,
        programare: programare.id,
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

  return Response.json({ total: due?.length ?? 0, sent, canceled, failed, reincercari })
})
