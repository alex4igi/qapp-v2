import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type { Feedback, InsertDto, UpdateDto } from '@/types/db'

export const PAGE_SIZE = 25

export type FeedbackListParams = { search: string; page: number }
export type FeedbackListResult = { rows: Feedback[]; total: number }

export async function listFeedback({
  search,
  page,
}: FeedbackListParams): Promise<FeedbackListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('feedback')
    .select('*', { count: 'exact' })
    .order('created', { ascending: false })
    .range(from, to)

  query = applyWordSearch(query, search, ['nume', 'detalii'])

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createFeedback(
  dto: InsertDto<'feedback'>,
): Promise<Feedback> {
  const { data, error } = await supabase
    .from('feedback')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateFeedback(
  id: string,
  dto: UpdateDto<'feedback'>,
): Promise<Feedback> {
  const { data, error } = await supabase
    .from('feedback')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await supabase.from('feedback').delete().eq('id', id)
  if (error) throw error
}
