import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { VPlatiInrolari } from '@/types/db'

export const PAGE_SIZE = 25

export type PlatiListParams = {
  search: string
  page: number
}

export type PlatiListResult = {
  rows: VPlatiInrolari[]
  total: number
}

export async function listPlatiInrolari({
  search,
  page,
}: PlatiListParams): Promise<PlatiListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('plati_inrolari')
    .select('*', { count: 'exact' })
    .order('data_incepere', { ascending: false, nullsFirst: false })
    .range(from, to)

  query = applyWordSearch(query, search, [
    'nume_client',
    'prenume_client',
    'nume_curs',
  ])

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}
