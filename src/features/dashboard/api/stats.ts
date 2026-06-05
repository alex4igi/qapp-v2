import { supabase } from '@/lib/supabase'

export type DashboardStats = {
  clienti: number
  cursuri: number
  teacheri: number
  incasariLunaCurenta: number
  restanteTotale: number
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
    supabase.from('statistica_restante_totale').select('total, incasat'),
  ])

  const firstError =
    clienti.error ||
    cursuri.error ||
    teacheri.error ||
    incLuna.error ||
    restante.error
  if (firstError) throw firstError

  const restanteTotale = (restante.data ?? []).reduce(
    (acc, r) => acc + ((r.total ?? 0) - (r.incasat ?? 0)),
    0,
  )

  return {
    clienti: clienti.count ?? 0,
    cursuri: cursuri.count ?? 0,
    teacheri: teacheri.count ?? 0,
    incasariLunaCurenta: incLuna.data?.total ?? 0,
    restanteTotale,
  }
}
