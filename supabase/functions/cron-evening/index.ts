// Edge Function cron — seară (programată ~23:30 ora României / 21:30 UTC).
// 0. tranziții sezoane: arhivează sezoane active expirate + activează sezoane planificate eligibile
// 1. programat → nu_a_venit pentru programări expirate (+ marcaj absent în roster)
// 2. flaguri de prioritate recurente, cu flag_streak:
//    - nou > 24h
//    - contactat/nu_raspunde fără contactare de > 2 zile
//    - contactat/de_revenit cu data_callback_dorit trecută
//    - nu_a_venit > 72h
//    - a_venit > 5 zile fără conversie
//    La al 2-lea flag ignorat (flag_streak >= 2) → auto-Nurture.
// 3. auto-Nurture plasă de siguranță: nr_contactari >= 4
// NU trimite SMS.
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
  if (expirateIds.length) {
    await supabase
      .from('leads')
      .update({ status: 'nu_a_venit' })
      .in('id', expirateIds)
    await supabase
      .from('programari_leads')
      .update({ prezenta: 'absent' })
      .in('lead', expirateIds)
      .eq('prezenta', 'programat')
    autoNeprezenti = expirateIds.length
  }

  // Helper — aplică flag / escaladare streak / auto-Nurture pe o listă.
  type FlagLead = {
    id: string
    flag_reminder: boolean
    flag_streak: number | null
    flag_reminder_at: string | null
  }
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY).toISOString()

  async function processStale(leads: FlagLead[]) {
    let flagged = 0
    let nurtured = 0
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
        if (streak >= 2) {
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

  const SEL = 'id, flag_reminder, flag_streak, flag_reminder_at'
  const cutoff24 = new Date(now.getTime() - DAY).toISOString()
  const cutoff72 = new Date(now.getTime() - 3 * DAY).toISOString()
  const cutoff5d = new Date(now.getTime() - 5 * DAY).toISOString()

  const { data: nouVechi } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'nou')
    .lt('created', cutoff24)

  const { data: cNuRasp } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'contactat')
    .eq('sub_status', 'nu_raspunde')
    .lt('ultima_contactare_la', twoDaysAgo)

  const { data: cDeRev } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'contactat')
    .eq('sub_status', 'de_revenit')
    .lte('data_callback_dorit', nowIso)

  const { data: navVechi } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'nu_a_venit')
    .lt('updated', cutoff72)

  const { data: avVechi } = await supabase
    .from('leads')
    .select(SEL)
    .eq('status', 'a_venit')
    .lt('updated', cutoff5d)

  const rNou = await processStale(nouVechi ?? [])
  const rNuRasp = await processStale(cNuRasp ?? [])
  const rDeRev = await processStale(cDeRev ?? [])
  const rNaV = await processStale(navVechi ?? [])
  const rAV = await processStale(avVechi ?? [])

  // 3. auto-Nurture plasă de siguranță — nr_contactari >= 4
  const { data: deNurture } = await supabase
    .from('leads')
    .select('id')
    .in('status', ['nou', 'contactat'])
    .gte('nr_contactari', 4)

  const nurtureIds = (deNurture ?? []).map((l) => l.id)
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
    nou: rNou,
    contactatNuRaspunde: rNuRasp,
    contactatDeRevenit: rDeRev,
    nuAVenit: rNaV,
    aVenit: rAV,
    autoNurture,
  }
  console.log('[cron/evening]', JSON.stringify(report.sumar))
  return Response.json(report)
})
