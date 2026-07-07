import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { InsertDto, Spectacol, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

export type SpectacoleListParams = { search: string; page: number }
export type SpectacoleListResult = { rows: Spectacol[]; total: number }

export async function listSpectacole({
  search,
  page,
}: SpectacoleListParams): Promise<SpectacoleListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('spectacole')
    .select('*', { count: 'exact' })
    .order('data', { ascending: false, nullsFirst: false })
    .range(from, to)

  query = applyWordSearch(query, search, ['nume'])

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createSpectacol(
  dto: InsertDto<'spectacole'>,
): Promise<Spectacol> {
  const { data, error } = await supabase
    .from('spectacole')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateSpectacol(
  id: string,
  dto: UpdateDto<'spectacole'>,
): Promise<Spectacol> {
  const { data, error } = await supabase
    .from('spectacole')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteSpectacol(id: string): Promise<void> {
  const { error } = await supabase.from('spectacole').delete().eq('id', id)
  if (error) throw error
}

export async function getSpectacol(id: string): Promise<Spectacol> {
  const { data, error } = await supabase
    .from('spectacole')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}
