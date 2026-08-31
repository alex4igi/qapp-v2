import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/db'
import { fetchAllRows } from '@/lib/fetchAll'

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
// cu cumpărătorii de bilet (incasari.bilet = eveniment_id, client sau lead) și cu
// lead-urile programate (o clasă demo n-are bilete: arăta „0 participanți" chiar
// cu 12 lead-uri înscrise).
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
  // Paginat: evenimente cu multe bilete ar trunchia numărătoarea de persoane.
  const incRows = await fetchAllRows(() =>
    supabase
      .from('incasari')
      .select('bilet, client, lead, id')
      .in('bilet', ids)
      .order('id', { ascending: true }),
  )

  // Persoane distincte per eveniment din încasări (client sau lead).
  const buyersByEvent = new Map<string, Set<string>>()
  for (const r of incRows) {
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

  // Lead-urile programate la evenimentele zilei — sursa reală de participanți
  // pentru clasele demo.
  const evIds = events.map((e) => e.id)
  const leadsByEvent = new Map<string, Set<string>>()
  if (evIds.length) {
    const { data: progRows } = await supabase
      .from('programari_leads')
      .select('lead, eveniment_programat')
      .in('eveniment_programat', evIds)
    for (const r of progRows ?? []) {
      if (!r.eveniment_programat || !r.lead) continue
      let set = leadsByEvent.get(r.eveniment_programat)
      if (!set) {
        set = new Set<string>()
        leadsByEvent.set(r.eveniment_programat, set)
      }
      set.add(r.lead)
    }
  }

  return events.map((e) => {
    const distinct = new Set<string>(e.participant ?? [])
    for (const id of buyersByEvent.get(e.id) ?? []) distinct.add(id)
    for (const id of leadsByEvent.get(e.id) ?? []) distinct.add(id)
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
