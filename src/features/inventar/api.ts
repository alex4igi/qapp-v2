import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Inventar, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

export type InventarListParams = { search: string; page: number }
export type InventarListResult = { rows: Inventar[]; total: number }

export async function listInventar({
  search,
  page,
}: InventarListParams): Promise<InventarListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('inventar')
    .select('*', { count: 'exact' })
    .order('articol', { ascending: true })
    .range(from, to)

  query = applyWordSearch(query, search, ['articol', 'descriere'])

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createInventar(
  dto: InsertDto<'inventar'>,
): Promise<Inventar> {
  const { data, error } = await supabase
    .from('inventar')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateInventar(
  id: string,
  dto: UpdateDto<'inventar'>,
): Promise<Inventar> {
  const { data, error } = await supabase
    .from('inventar')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteInventar(id: string): Promise<void> {
  const { error } = await supabase.from('inventar').delete().eq('id', id)
  if (error) throw error
}
