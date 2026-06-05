import { supabase } from '@/lib/supabase'

export type DashboardChartRow = {
  curs: string
  incasari: number
  restante: number
}

// Bar chart pe dashboard: Incasări vs Restanțe per curs (cumulativ).
export async function getDashboardChart(
  cursuri: Array<{ id: string; numele: string }>,
): Promise<DashboardChartRow[]> {
  if (cursuri.length === 0) return []
  const cursIds = cursuri.map((c) => c.id)
  const { data, error } = await supabase
    .from('restante_curs_luna')
    .select('id_curs, total_de_incasat, total_incasat')
    .in('id_curs', cursIds)
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
    const inc = Number(r.total_incasat ?? 0)
    const total = Number(r.total_de_incasat ?? 0)
    existing.incasari += inc
    existing.restante += Math.max(0, total - inc)
  }
  return cursuri.map((c) => acc.get(c.id)!)
}
