import { supabase } from '@/lib/supabase'

export type DashboardKpis = {
  incasariAzi: number
  restanteTotale: number
  programariAzi: number
}

// KPI-uri din topbar-ul dashboard-ului zilei: încasări la data X, restanțe
// totale curente, număr de programări lead pe data X.
export async function getDashboardKpis(date: string): Promise<DashboardKpis> {
  const [inc, restante, prog] = await Promise.all([
    supabase.from('incasari').select('suma').eq('data', date),
    supabase.from('statistica_restante_totale').select('total, incasat'),
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
  const restanteTotale = (restante.data ?? []).reduce(
    (acc, r) => acc + ((r.total ?? 0) - (r.incasat ?? 0)),
    0,
  )
  return { incasariAzi, restanteTotale, programariAzi: prog.count ?? 0 }
}
