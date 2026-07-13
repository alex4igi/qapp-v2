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

  // Review-urile (rating pe curs/eveniment din portal) apar pe fișa cursului/evenimentului,
  // nu aici — pagina asta e worklist-ul de sesizări.
  let query = supabase
    .from('feedback')
    .select('*', { count: 'exact' })
    .or('tip.is.null,tip.neq.Review')
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

export type Review = {
  id: string
  rating: number | null
  detalii: string | null
  nume: string | null
  created: string | null
}

// Review-urile (rating de la membri) pentru un curs SAU un eveniment.
export async function listReviews(params: {
  cursId?: string
  evenimentId?: string
}): Promise<Review[]> {
  let query = supabase
    .from('feedback')
    .select('id, rating, detalii, nume, created')
    .eq('tip', 'Review')
    .not('rating', 'is', null)
    .order('created', { ascending: false })

  if (params.cursId) query = query.eq('cursul', params.cursId)
  if (params.evenimentId) query = query.eq('eveniment', params.evenimentId)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}
