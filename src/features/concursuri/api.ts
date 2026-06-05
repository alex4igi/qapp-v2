import { supabase } from '@/lib/supabase'
import type { Concurs, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

export type ConcursuriListParams = { search: string; page: number }
export type ConcursuriListResult = { rows: Concurs[]; total: number }

export async function listConcursuri({
  search,
  page,
}: ConcursuriListParams): Promise<ConcursuriListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('concursuri')
    .select('*', { count: 'exact' })
    .order('data_evenimentului', { ascending: false, nullsFirst: false })
    .range(from, to)

  const term = search.trim()
  if (term) {
    query = query.ilike('numele_concursului', `%${term}%`)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createConcurs(
  dto: InsertDto<'concursuri'>,
): Promise<Concurs> {
  const { data, error } = await supabase
    .from('concursuri')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateConcurs(
  id: string,
  dto: UpdateDto<'concursuri'>,
): Promise<Concurs> {
  const { data, error } = await supabase
    .from('concursuri')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteConcurs(id: string): Promise<void> {
  const { error } = await supabase.from('concursuri').delete().eq('id', id)
  if (error) throw error
}
