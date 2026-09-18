// Edge Function cron — seară (programată ~23:30 ora României / 21:30 UTC).
// 0. tranziții sezoane: arhivează sezoane active expirate + activează sezoane planificate eligibile
// 1. programări expirate, prin `prune_expired_leads` (sursa unică, se uită la
//    PROGRAMĂRI, nu la cartonaș): bifat prezent → a_venit; a 1-a neprezentare →
//    nu_a_venit; a 2-a → direct nurture.
// 2. restul deciziilor vin din `leads_de_flagat_seara()` — o singură funcție SQL
//    care spune pe fiecare lead bucket-ul, acțiunea ('flag' sau 'nurture') și
//    categoria motivului. Pragurile nu mai trăiesc în TypeScript: pot fi văzute
//    într-un dry-run înainte de a fi schimbate.
//      nou_termen_depasit    → flag  (termenul procedurii, nu „24h de la intrare")
//      nu_raspunde_scadent   → flag
//      de_revenit_scadent    → flag
//      nu_a_venit_10z        → nurture  (10 zile de la NEPREZENTARE)
//      plasa_3_incercari     → nurture  (efort dovedit, prag 3)
//
// DRUMUL 4 E ÎNCHIS (decizie Alex, 09-17): un steguleț ignorat pe `nu_raspunde`
// sau pe `de_revenit` înseamnă că NOI n-am sunat. Vina noastră nu scoate omul
// din pipeline — stegulețul crește la nesfârșit, leadul rămâne pe „De lucrat
// azi" până îl atinge cineva. Ies automat doar cei care n-au răspuns de 3 ori
// sau n-au venit.
//
// GARDĂ transversală: niciun pas nu trimite în Nurture un lead al cărui client e
// încă Activ/Inactiv (`leaduriProtejate`) — nurture e pool de reactivare, iar
// acolo ajungeau conversii neînregistrate. Flagurile rămân.
// NU trimite SMS.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { leaduriProtejate } from '../_shared/leadNurture.ts'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'

const DAY = 86_400_000

type RandDeLucru = {
  lead_id: string
  bucket: string
  actiune: 'flag' | 'nurture'
  categorie: string | null
  id_client: string | null
  flag_reminder: boolean
  flag_streak: number | null
  flag_reminder_at: string | null
}

Deno.serve(async (req) => {
  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const now = new Date()
  const nowIso = now.toISOString()
  const report: Record<string, unknown> = { rulatLa: nowIso }

  // 0. Tranziții sezoane (arhivare expirate + activare eligibile)
  const { data: archived } = await supabase.rpc('archive_expired_sezoane')
  const { data: activated } = await supabase.rpc('activate_eligible_sezoane')
  const sezoneSumar = {
    arhivate: typeof archived === 'number' ? archived : 0,
    activate: typeof activated === 'number' ? activated : 0,
  }

  // 1. Programări expirate → prezență + statusul leadului.
  //
  // Logica NU trăiește aici. Pasul ăsta se uita la `leads.status='programat'`
  // + `leads.data_programare`, adică la cartonașul din kanban — aceeași citire
  // greșită reparată pe 09-08 la remindere: cine e înscris la o clasă demo din
  // rosterul evenimentului nu primește mereu data pe cartonaș, deci programarea
  // lui expira fără să fie închisă. RPC-ul se uită la PROGRAMĂRI, are gardul de
  // programare viitoare și marchează absente DOAR rândurile expirate.
  //
  // Rulează și la deschiderea /leads; aici e plasa pentru zilele în care nu intră
  // nimeni în aplicație. Fiind idempotent, a doua rulare nu are ce strica.
  const { data: prune } = await supabase.rpc('prune_expired_leads')
  const pruneRes = (prune ?? {}) as {
    absente?: number
    a_venit?: number
    nurture?: number
    nu_a_venit?: number
  }

  // 2. Lista de lucru, cu politica deja decisă în SQL.
  const { data: deLucru, error: errLucru } = await supabase.rpc(
    'leads_de_flagat_seara',
  )
  if (errLucru) {
    console.error('[cron/evening] leads_de_flagat_seara:', errLucru.message)
    return Response.json({ ...report, eroare: errLucru.message }, { status: 500 })
  }
  const randuri = (deLucru ?? []) as RandDeLucru[]

  // Un lead poate apărea în două bucket-uri (ex. „nu răspunde scadent" + plasa
  // celor 3 încercări). Nurture bate flagul: e decizia mai tare.
  const primulPeLead = new Map<string, RandDeLucru>()
  for (const r of randuri) {
    const existent = primulPeLead.get(r.lead_id)
    if (!existent || (existent.actiune === 'flag' && r.actiune === 'nurture')) {
      primulPeLead.set(r.lead_id, r)
    }
  }
  const deLucrat = [...primulPeLead.values()]

  const deNurturat = deLucrat.filter((r) => r.actiune === 'nurture')
  const protejate = await leaduriProtejate(supabase, deNurturat)

  const sumar: Record<string, { flagged: number; nurtured: number; protejate: number }> = {}
  const bump = (bucket: string) =>
    (sumar[bucket] ??= { flagged: 0, nurtured: 0, protejate: 0 })

  // Flagul escaladează doar ca număr (streak), niciodată în ieșire din pipeline:
  // de aici s-a scos drumul 4. Streak-ul rămâne fiindcă „De lucrat azi" îl
  // folosește ca să urce leadurile neglijate în capul listei.
  const douaZile = new Date(now.getTime() - 2 * DAY).toISOString()

  for (const r of deLucrat) {
    const s = bump(r.bucket)

    if (r.actiune === 'nurture') {
      if (protejate.has(r.lead_id)) {
        s.protejate++
        continue
      }
      const { error } = await supabase
        .from('leads')
        .update({
          status: 'nurture',
          sub_status: null,
          motiv_categorie: r.categorie,
          flag_reminder: false,
          flag_streak: 0,
          flag_reminder_at: null,
        })
        .eq('id', r.lead_id)
      if (!error) s.nurtured++
      continue
    }

    if (!r.flag_reminder) {
      const { error } = await supabase
        .from('leads')
        .update({
          flag_reminder: true,
          flag_streak: 1,
          flag_reminder_at: nowIso,
        })
        .eq('id', r.lead_id)
      if (!error) s.flagged++
    } else if ((r.flag_reminder_at ?? '') < douaZile) {
      // Flag ignorat un ciclu întreg → crește streak-ul. Nu mai există prag de
      // ieșire: nimeni nu pleacă din pipeline fiindcă noi n-am sunat.
      const { error } = await supabase
        .from('leads')
        .update({
          flag_streak: (r.flag_streak ?? 1) + 1,
          flag_reminder_at: nowIso,
        })
        .eq('id', r.lead_id)
      if (!error) s.flagged++
    }
  }

  report.sumar = {
    sezoane: sezoneSumar,
    programari: {
      absente: pruneRes.absente ?? 0,
      aVenit: pruneRes.a_venit ?? 0,
      nuAVenit: pruneRes.nu_a_venit ?? 0,
      nurture: pruneRes.nurture ?? 0,
    },
    bucketuri: sumar,
  }
  console.log('[cron/evening]', JSON.stringify(report.sumar))
  return Response.json(report)
})
