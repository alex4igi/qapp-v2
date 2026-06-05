import { supabase } from '@/lib/supabase'
import type { Eveniment, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

export type EvenimenteListParams = { search: string; page: number }
export type EvenimenteListResult = { rows: Eveniment[]; total: number }

export async function listEvenimente({
  search,
  page,
}: EvenimenteListParams): Promise<EvenimenteListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('evenimente')
    .select('*', { count: 'exact' })
    .order('data', { ascending: false, nullsFirst: false })
    .range(from, to)

  const term = search.trim()
  if (term) {
    query = query.or(`nume_eveniment.ilike.%${term}%,locatia.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createEveniment(
  dto: InsertDto<'evenimente'>,
): Promise<Eveniment> {
  const { data, error } = await supabase
    .from('evenimente')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateEveniment(
  id: string,
  dto: UpdateDto<'evenimente'>,
): Promise<Eveniment> {
  const { data, error } = await supabase
    .from('evenimente')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteEveniment(id: string): Promise<void> {
  const { error } = await supabase.from('evenimente').delete().eq('id', id)
  if (error) throw error
}
