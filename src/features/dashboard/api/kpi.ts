import { supabase } from '@/lib/supabase'

export type DashboardKpis = {
  incasariAzi: number
  restanteNet: number // de recuperat (rest>0, neprescrise) — definiția canonică
  restantePrescris: number // > 2 ani, excluse din totalul de recuperat
  programariAzi: number
}

// KPI-uri din topbar-ul dashboard-ului zilei: încasări la data X, restanțe
// totale curente, număr de programări lead pe data X.
// Restanțele vin din get_restante_totale (aceeași bază ca /financiar și /statistici):
// net recuperabil + prescris separat, ca toate suprafețele să arate aceeași cifră.
export async function getDashboardKpis(
  date: string,
  locatieId?: string | null,
): Promise<DashboardKpis> {
  let incQ = supabase.from('incasari').select('suma').eq('data', date)
  if (locatieId) incQ = incQ.eq('locatie', locatieId)
  const [inc, restante, prog] = await Promise.all([
    incQ,
    supabase.rpc('get_restante_totale', { p_locatie: locatieId ?? undefined }),
    supabase
      .from('programari_leads')
      .select('*', { count: 'exact', head: true })
      .eq('data_programarii', date),
  ])
  if (inc.error) throw inc.error
  if (restante.error) throw restante.error
  if (prog.error) throw prog.error

  const incasariAzi = (inc.data ?? []).reduce(
    (acc, r) => acc + Number(r.suma ?? 0),
    0,
  )
  const r = (restante.data ?? [])[0]
  return {
    incasariAzi,
    restanteNet: Number(r?.rest_net ?? 0),
    restantePrescris: Number(r?.rest_prescris ?? 0),
    programariAzi: prog.count ?? 0,
  }
}
