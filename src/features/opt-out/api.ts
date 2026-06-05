import { supabase } from '@/lib/supabase'

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
  const { data, error } = await supabase
    .from('opt_out_list')
    .select('entity, id, nume_complet, email, telefon, motiv, opt_out_la')
    .order('opt_out_la', { ascending: false })
  if (error) throw error
  return (data ?? []) as OptOutListRow[]
}
