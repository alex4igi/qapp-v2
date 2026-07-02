import { supabase } from '@/lib/supabase'

export type DashboardKpis = {
  incasariAzi: number
  programariAzi: number
}

// KPI-uri din topbar-ul dashboard-ului zilei: încasări la data X și număr de
// programări lead pe data X. Ambele respectă locația selectată în header.
export async function getDashboardKpis(
  date: string,
  locatieId?: string | null,
): Promise<DashboardKpis> {
  let incQ = supabase.from('incasari').select('suma').eq('data', date)
  if (locatieId) incQ = incQ.eq('locatie', locatieId)
  let progQ = supabase
    .from('programari_leads')
    .select('*', { count: 'exact', head: true })
    .eq('data_programarii', date)
  if (locatieId) progQ = progQ.eq('locatie', locatieId)
  const [inc, prog] = await Promise.all([incQ, progQ])
  if (inc.error) throw inc.error
  if (prog.error) throw prog.error

  const incasariAzi = (inc.data ?? []).reduce(
    (acc, r) => acc + Number(r.suma ?? 0),
    0,
  )
  return {
    incasariAzi,
    programariAzi: prog.count ?? 0,
  }
}
