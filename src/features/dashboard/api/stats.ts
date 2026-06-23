import { supabase } from '@/lib/supabase'

export type DashboardStats = {
  clienti: number
  cursuri: number
  teacheri: number
  incasariLunaCurenta: number
  restanteNet: number // de recuperat (neprescrise) — aceeași bază ca restul aplicației
}

// KPI-uri totale (cumulativ peste tot) — cardurile din partea de sus a
// dashboard-ului principal.
export async function getDashboardStats(): Promise<DashboardStats> {
  const monthId = new Date().toISOString().slice(0, 7)

  const [clienti, cursuri, teacheri, incLuna, restante] = await Promise.all([
    supabase.from('clienti').select('*', { count: 'exact', head: true }),
    supabase.from('cursuri').select('*', { count: 'exact', head: true }),
    supabase.from('teacheri').select('*', { count: 'exact', head: true }),
    supabase
      .from('statistica_incasari_totale')
      .select('total')
      .eq('id', monthId)
      .maybeSingle(),
    supabase.rpc('get_restante_totale'),
  ])

  const firstError =
    clienti.error ||
    cursuri.error ||
    teacheri.error ||
    incLuna.error ||
    restante.error
  if (firstError) throw firstError

  const restanteNet = Number((restante.data ?? [])[0]?.rest_net ?? 0)

  return {
    clienti: clienti.count ?? 0,
    cursuri: cursuri.count ?? 0,
    teacheri: teacheri.count ?? 0,
    incasariLunaCurenta: incLuna.data?.total ?? 0,
    restanteNet,
  }
}
