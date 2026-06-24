import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'

export type DashboardEvent = {
  id: string
  nume: string
  tip: Enums<'tip_eveniment'>
  data: string | null
  locatia: string | null
  pretBilet: number | null
  participantiCount: number
}

// Evenimentele zilei (data == ziua de lucru), exclus cele anulate. Numărul de
// participanți = persoane distincte din `participant[]` (adăugați manual) reunite
// cu cumpărătorii de bilet (incasari.bilet = eveniment_id, client sau lead).
// Fără filtru de locație — `evenimente.locatia` e text liber, nu FK.
export async function getDashboardEvents(
  date: string,
): Promise<DashboardEvent[]> {
  const { data: evRows, error } = await supabase
    .from('evenimente')
    .select('id, nume_eveniment, tip, data, locatia, pret_bilet, participant')
    .eq('data', date)
    // status NULL e valid (neînceput); doar „Anulat" se exclude.
    .or('status.is.null,status.neq.Anulat')
    .order('nume_eveniment', { ascending: true })
  if (error) throw error
  const events = evRows ?? []
  if (events.length === 0) return []

  const ids = events.map((e) => e.id)
  const { data: incRows, error: incErr } = await supabase
    .from('incasari')
    .select('bilet, client, lead')
    .in('bilet', ids)
  if (incErr) throw incErr

  // Persoane distincte per eveniment din încasări (client sau lead).
  const buyersByEvent = new Map<string, Set<string>>()
  for (const r of incRows ?? []) {
    if (!r.bilet) continue
    const key = r.client ?? r.lead
    if (!key) continue
    let set = buyersByEvent.get(r.bilet)
    if (!set) {
      set = new Set<string>()
      buyersByEvent.set(r.bilet, set)
    }
    set.add(key)
  }

  return events.map((e) => {
    const distinct = new Set<string>(e.participant ?? [])
    for (const id of buyersByEvent.get(e.id) ?? []) distinct.add(id)
    return {
      id: e.id,
      nume: e.nume_eveniment,
      tip: e.tip,
      data: e.data,
      locatia: e.locatia,
      pretBilet: e.pret_bilet,
      participantiCount: distinct.size,
    }
  })
}
