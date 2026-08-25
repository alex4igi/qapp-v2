import { supabase } from '@/lib/supabase'

export type DashboardChartRow = {
  curs: string
  incasari: number
  restante: number
}

// Bar chart pe dashboard: Incasări vs Restanțe per curs, pe luna curentă
// (`luna` = YYYY-MM). Restanța = total_restant_net din view (definiția
// canonică: fără prescrise, rezilieri, luni viitoare).
export async function getDashboardChart(
  cursuri: Array<{ id: string; numele: string }>,
  luna: string,
): Promise<DashboardChartRow[]> {
  if (cursuri.length === 0) return []
  const cursIds = cursuri.map((c) => c.id)
  const { data, error } = await supabase
    .from('restante_curs_luna')
    .select('id_curs, total_incasat, total_restant_net')
    .in('id_curs', cursIds)
    .eq('luna', luna)
  if (error) throw error
  // Inițializăm fiecare curs din cards cu 0/0 — astfel chart-ul are
  // 1 bară per card, chiar dacă cursul n-are înrolări sau plăți.
  const acc = new Map<string, DashboardChartRow>()
  for (const c of cursuri) {
    acc.set(c.id, { curs: c.numele, incasari: 0, restante: 0 })
  }
  for (const r of data ?? []) {
    if (!r.id_curs) continue
    const existing = acc.get(r.id_curs)
    if (!existing) continue
    existing.incasari += Number(r.total_incasat ?? 0)
    existing.restante += Number(r.total_restant_net ?? 0)
  }
  return cursuri.map((c) => acc.get(c.id)!)
}
