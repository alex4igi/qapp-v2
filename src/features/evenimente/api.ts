import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Eveniment, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

export type EvenimenteListParams = {
  search: string
  page: number
  an?: number | null
  temporal?: 'all' | 'viitoare' | 'trecute'
  today?: string // YYYY-MM-DD, pasat din componentă pentru filtrul Viitoare/Trecute
}
export type EvenimenteListResult = { rows: Eveniment[]; total: number }

export async function listEvenimente({
  search,
  page,
  an,
  temporal = 'all',
  today,
}: EvenimenteListParams): Promise<EvenimenteListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('evenimente')
    .select('*', { count: 'exact' })
    .order('data', { ascending: false, nullsFirst: false })
    .range(from, to)

  query = applyWordSearch(query, search, ['nume_eveniment', 'locatia'])

  if (an) {
    query = query.gte('data', `${an}-01-01`).lte('data', `${an}-12-31`)
  }
  if (today && temporal === 'viitoare') {
    query = query.gte('data', today)
  } else if (today && temporal === 'trecute') {
    query = query.lt('data', today)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

// Anii disponibili (descrescător) din `data` evenimentelor; include mereu anul curent.
export async function listEvenimenteAni(): Promise<number[]> {
  const maxRes = await supabase
    .from('evenimente')
    .select('data')
    .not('data', 'is', null)
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxRes.error) throw maxRes.error
  const minRes = await supabase
    .from('evenimente')
    .select('data')
    .not('data', 'is', null)
    .order('data', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (minRes.error) throw minRes.error

  const yearOf = (d?: string | null) => (d ? Number(d.slice(0, 4)) : null)
  const nowY = new Date().getFullYear()
  const hi = Math.max(yearOf(maxRes.data?.data) ?? nowY, nowY)
  const lo = Math.min(yearOf(minRes.data?.data) ?? nowY, nowY)
  const years: number[] = []
  for (let y = hi; y >= lo; y--) years.push(y)
  return years
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
