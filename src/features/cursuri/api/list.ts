import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { VListaCursuri } from '@/types/db'

export const PAGE_SIZE = 25

export type CursuriListParams = {
  search: string
  page: number
  locatieId?: string | null
}

export type CursuriListResult = {
  rows: VListaCursuri[]
  total: number
}

export async function listCursuri({
  search,
  page,
  locatieId,
  cursIds,
}: CursuriListParams & { cursIds?: string[] | null }): Promise<CursuriListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('lista_cursuri')
    .select('*', { count: 'exact' })
    .order('locatie', { ascending: true, nullsFirst: false })
    .order('numele_cursului', { ascending: true })
    .range(from, to)

  query = applyWordSearch(query, search, ['numele_cursului'])
  if (locatieId) {
    query = query.eq('id_locatie', locatieId)
  }
  if (cursIds) {
    if (cursIds.length === 0) return { rows: [], total: 0 }
    query = query.in('id', cursIds)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}
