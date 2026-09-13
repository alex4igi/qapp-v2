// Edge Function cron — sfârșit de sezon.
// La/după data_final a sezonului curent, mută toate leadurile rămase în
// waiting_list → nurture (pool pentru campanii de reactivare la redeschidere).
// Rulează zilnic; după ce a golit waiting_list devine no-op.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { refuzaApelStrain } from '../_shared/cronAuth.ts'

Deno.serve(async (req) => {
  const refuz = refuzaApelStrain(req)
  if (refuz) return refuz

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const today = new Date().toISOString().slice(0, 10)

  // Sezonul curent — cel mai recent început.
  const { data: sezon } = await supabase
    .from('sezoane')
    .select('numele_sezonului, data_final')
    .order('data_incepere', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sezon?.data_final || today < sezon.data_final) {
    return Response.json({
      skipped: true,
      reason: 'sezonul nu s-a încheiat',
      dataFinal: sezon?.data_final ?? null,
    })
  }

  const { data: deMutat } = await supabase
    .from('leads')
    .select('id')
    .eq('status', 'waiting_list')

  const ids = (deMutat ?? []).map((l) => l.id)
  let mutati = 0
  if (ids.length) {
    const { error } = await supabase
      .from('leads')
      .update({ status: 'nurture', sub_status: null })
      .in('id', ids)
    if (!error) mutati = ids.length
  }

  console.log(`[cron/season-end] waiting_list → nurture: ${mutati}`)
  return Response.json({
    sezon: sezon.numele_sezonului,
    mutatiInNurture: mutati,
    rulatLa: new Date().toISOString(),
  })
})
