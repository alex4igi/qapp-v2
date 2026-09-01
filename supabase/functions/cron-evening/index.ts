// Edge Function cron — seară (programată ~23:30 ora României / 21:30 UTC).
// 0. tranziții sezoane: arhivează sezoane active expirate + activează sezoane planificate eligibile
// 1. programat → neprezentare pentru programări expirate (+ marcaj absent în roster).
//    A 1-a neprezentare → nu_a_venit; a 2-a (nr_neprezentari>=2) → direct nurture.
// 1b. nu_a_venit rămâne în listă 10 zile, apoi → nurture.
// 2. flaguri de prioritate recurente, cu flag_streak:
//    - nou > 24h                                        (flag DOAR, fără nurture)
//    - contactat/nu_raspunde fără contactare de > 2 zile → auto-Nurture la streak 2
//    - contactat/de_revenit cu data_callback_dorit trecută → idem
//    Un contact logat în `lead_contacte` stinge steagul (trigger
//    bump_lead_ultima_contactare), deci escaladarea cere tăcere reală.
//    NB: a_venit NU se flaghează aici — are cadență săptămânală (lunea), în
//    cron-morning (lista de sunat de luni pentru demo-uri neconvertite).
// 3. auto-Nurture plasă de siguranță: nr_contactari >= 4
// GARDĂ transversală: niciun pas nu trimite în Nurture un lead al cărui client e
// încă Activ/Inactiv (`leaduriProtejate`) — nurture e pool de reactivare, iar
// acolo ajungeau conversii neînregistrate. Flagurile rămân.
// NU trimite SMS.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { leaduriProtejate } from '../_shared/leadNurture.ts'

const DAY = 86_400_000

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
  const nowIso = now.toISOString()
  const report: Record<string, unknown> = { rulatLa: nowIso }

  // 0. Tranziții sezoane (arhivare expirate + activare eligibile)
  const { data: archived } = await supabase.rpc('archive_expired_sezoane')
  const { data: activated } = await supabase.rpc('activate_eligible_sezoane')
  const sezoneSumar = {
    arhivate: typeof archived === 'number' ? archived : 0,
    activate: typeof activated === 'number' ? activated : 0,
  }

  // 1. programat → nu_a_venit (programări trecute de momentul curent)
  const { data: expirate } = await supabase
    .from('leads')
    .select('id')
    .eq('status', 'programat')
    .lt('data_programare', nowIso)

  const expirateIds = (expirate ?? []).map((l) => l.id)
  let autoNeprezenti = 0
  let autoNurtureNoShow = 0
  if (expirateIds.length) {
    // Întâi marcăm programările absente — triggerul recalculează nr_neprezentari.
    await supabase
      .from('programari_leads')
      .update({ prezenta: 'absent' })
      .in('lead', expirateIds)
      .eq('prezenta', 'programat')
    // Apoi împărțim: a 2-a neprezentare (>=2) merge direct în nurture, restul în nu_a_venit.
    const { data: dupaAbsent } = await supabase
      .from('leads')
      .select('id, nr_neprezentari, id_client')
      .in('id', expirateIds)
    const candidatiNoShow = (dupaAbsent ?? []).filter(
      (l) => (l.nr_neprezentari ?? 0) >= 2,
    )
    const protejatiNoShow = await leaduriProtejate(supabase, candidatiNoShow)
    const nurtureIds = candidatiNoShow
      .filter((l) => !protejatiNoShow.has(l.id))
      .map((l) => l.id)
    // Protejații cu 2+ neprezentări nu merg în nurture, dar nici nu pot rămâne
    // 'programat' cu programarea consumată — ar sta blocați acolo la nesfârșit.
    const naVenitIds = (dupaAbsent ?? [])
      .filter((l) => (l.nr_neprezentari ?? 0) < 2 || protejatiNoShow.has(l.id))
      .map((l) => l.id)
    if (nurtureIds.length) {
      await supabase
        .from('leads')
        .update({
          status: 'nurture',
          sub_status: null,
          flag_reminder: false,
          flag_streak: 0,
          flag_reminder_at: null,
        })
        .in('id', nurtureIds)
      autoNurtureNoShow = nurtureIds.length
    }
    if (naVenitIds.length) {
      await supabase
        .from('leads')
        .update({ status: 'nu_a_venit' })
        .in('id', naVenitIds)
    }
    autoNeprezenti = naVenitIds.length
  }

  // Helper — aplică flag / escaladare streak / auto-Nurture pe o listă.
  type FlagLead = {
    id: string
    id_client: string | null
    flag_reminder: boolean
    flag_streak: number | null
    flag_reminder_at: string | null
  }
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY).toISOString()

  // `autoNurture: false` = leadul se flaghează la nesfârșit, dar nu părăsește
  // niciodată coloana singur. Folosit pentru 'nou': un lead pe care nimeni nu
  // l-a sunat NU trebuie să dispară din pipeline după 4 zile doar pentru că a
  // trecut timpul — rămâne roșu în „De lucrat azi", cu streak-ul crescând, până
  // îl atinge cineva. Ieșirea automată rămâne pe efort dovedit
  // (`nr_contactari >= 4`, pasul 3), nu pe vechime.
  async function processStale(
    leads: FlagLead[],
    opts: { autoNurture: boolean } = { autoNurture: true },
  ) {
    let flagged = 0
    let nurtured = 0
    // Lead-urile cu client activ se flaghează, dar nu escaladează niciodată.
    const protejate = opts.autoNurture
      ? await leaduriProtejate(supabase, leads)
      : new Set<string>()
    for (const l of leads) {
      if (!l.flag_reminder) {
        // Primul flag.
        await supabase
          .from('leads')
          .update({
            flag_reminder: true,
            flag_streak: 1,
            flag_reminder_at: nowIso,
          })
          .eq('id', l.id)
        flagged++
      } else if ((l.flag_reminder_at ?? '') < twoDaysAgo) {
        // Flag ignorat un ciclu întreg → escaladează.
        const streak = (l.flag_streak ?? 1) + 1
        if (streak >= 2 && opts.autoNurture && !protejate.has(l.id)) {
          await supabase
            .from('leads')
            .update({
              status: 'nurture',
              sub_status: null,
              flag_reminder: false,
              flag_streak: 0,
              flag_reminder_at: null,
            })
            .eq('id', l.id)
          nurtured++
        } else {
          await supabase
            .from('leads')
            .update({ flag_streak: streak, flag_reminder_at: nowIso })
            .eq('id', l.id)
          flagged++
        }
      }
    }
    return { flagged, nurtured }
  }

  const SEL = 'id, id_client, flag_reminder, flag_streak, flag_reminder_at'
  const cutoff24 = new Date(now.getTime() - DAY).toISOString()
  const cutoff10d = new Date(now.getTime() - 10 * DAY).toISOString()

  const { data: nouVechi } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'nou')
    .eq('deja_client', false)
    .lt('created', cutoff24)

  const { data: cNuRasp } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'contactat')
    .eq('sub_status', 'nu_raspunde')
    .eq('deja_client', false)
    .lt('ultima_contactare_la', twoDaysAgo)

  const { data: cDeRev } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'contactat')
    .eq('sub_status', 'de_revenit')
    .eq('deja_client', false)
    .lte('data_callback_dorit', nowIso)

  // nu_a_venit rămâne în listă 10 zile, apoi trece automat în nurture
  // (decizie 2026-07-01). Nu mai folosim flag/escaladare pentru această coloană.
  const { data: navVechi } = await supabase
    .from('leads')
    .select('id, id_client')
    .eq('status', 'nu_a_venit')
    .lt('updated', cutoff10d)

  const protejatiNav = await leaduriProtejate(supabase, navVechi ?? [])
  const navVechiIds = (navVechi ?? [])
    .filter((l) => !protejatiNav.has(l.id))
    .map((l) => l.id)
  let nuAVenitNurtured = 0
  if (navVechiIds.length) {
    await supabase
      .from('leads')
      .update({
        status: 'nurture',
        sub_status: null,
        flag_reminder: false,
        flag_streak: 0,
        flag_reminder_at: null,
      })
      .in('id', navVechiIds)
    nuAVenitNurtured = navVechiIds.length
  }

  const rNou = await processStale(nouVechi ?? [], { autoNurture: false })
  const rNuRasp = await processStale(cNuRasp ?? [])
  const rDeRev = await processStale(cDeRev ?? [])

  // 3. auto-Nurture plasă de siguranță — nr_contactari >= 4
  const { data: deNurture } = await supabase
    .from('leads')
    .select('id, id_client')
    .in('status', ['nou', 'contactat'])
    .eq('deja_client', false)
    .gte('nr_contactari', 4)

  const protejatiPlasa = await leaduriProtejate(supabase, deNurture ?? [])
  const nurtureIds = (deNurture ?? [])
    .filter((l) => !protejatiPlasa.has(l.id))
    .map((l) => l.id)
  let autoNurture = 0
  if (nurtureIds.length) {
    const { error } = await supabase
      .from('leads')
      .update({ status: 'nurture', sub_status: null })
      .in('id', nurtureIds)
    if (!error) autoNurture = nurtureIds.length
  }

  report.sumar = {
    sezoane: sezoneSumar,
    autoNeprezenti,
    autoNurtureNoShow,
    nuAVenitNurtured,
    nou: rNou,
    contactatNuRaspunde: rNuRasp,
    contactatDeRevenit: rDeRev,
    autoNurture,
  }
  console.log('[cron/evening]', JSON.stringify(report.sumar))
  return Response.json(report)
})
