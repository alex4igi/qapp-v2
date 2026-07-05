import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAll'

export type OptOutEntity = 'client' | 'lead' | 'familie'

export async function markOptOut(
  entity: OptOutEntity,
  id: string,
  motiv?: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_opt_out', {
    p_entity: entity,
    p_id: id,
    p_motiv: motiv ?? undefined,
  })
  if (error) throw error
}

export async function clearOptOut(
  entity: OptOutEntity,
  id: string,
): Promise<void> {
  const { error } = await supabase.rpc('clear_opt_out', {
    p_entity: entity,
    p_id: id,
  })
  if (error) throw error
}

export type OptOutListRow = {
  entity: OptOutEntity
  id: string
  nume_complet: string
  email: string | null
  telefon: string | null
  motiv: string | null
  opt_out_la: string | null
}

export async function fetchOptOutList(): Promise<OptOutListRow[]> {
  // Paginat: view-ul crește nelimitat (clienți + leaduri); fără paginare lista
  // s-ar opri silențios la 1000.
  const data = await fetchAllRows(() =>
    supabase
      .from('opt_out_list')
      .select('entity, id, nume_complet, email, telefon, motiv, opt_out_la')
      .order('opt_out_la', { ascending: false })
      .order('id', { ascending: true }),
  )
  return data as OptOutListRow[]
}
