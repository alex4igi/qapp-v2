import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Cheltuiala, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

export type CheltuieliListParams = { search: string; page: number }
export type CheltuieliListResult = { rows: Cheltuiala[]; total: number }

export async function listCheltuieli({
  search,
  page,
}: CheltuieliListParams): Promise<CheltuieliListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('cheltuieli')
    .select('*', { count: 'exact' })
    .order('data', { ascending: false, nullsFirst: false })
    .range(from, to)

  query = applyWordSearch(query, search, ['nume', 'descriere'])

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createCheltuiala(
  dto: InsertDto<'cheltuieli'>,
): Promise<Cheltuiala> {
  const { data, error } = await supabase
    .from('cheltuieli')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCheltuiala(
  id: string,
  dto: UpdateDto<'cheltuieli'>,
): Promise<Cheltuiala> {
  const { data, error } = await supabase
    .from('cheltuieli')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteCheltuiala(id: string): Promise<void> {
  const { error } = await supabase.from('cheltuieli').delete().eq('id', id)
  if (error) throw error
}
