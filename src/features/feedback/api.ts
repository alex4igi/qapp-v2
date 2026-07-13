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
  openSesiuneId?: string
}): Promise<Review[]> {
  let query = supabase
    .from('feedback')
    .select('id, rating, detalii, nume, created')
    .eq('tip', 'Review')
    .not('rating', 'is', null)
    .order('created', { ascending: false })

  if (params.cursId) query = query.eq('cursul', params.cursId)
  if (params.evenimentId) query = query.eq('eveniment', params.evenimentId)
  if (params.openSesiuneId) query = query.eq('open_sesiune', params.openSesiuneId)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export type SesiuneRating = {
  sesiuneId: string
  data: string | null
  avg: number
  count: number
  comments: Review[]
}

// Rating agregat per sesiune OPEN a unui curs (doar sesiunile care au primit review-uri).
export async function listOpenSesiuniRatings(
  cursId: string,
): Promise<SesiuneRating[]> {
  const { data: sessions, error: sErr } = await supabase
    .from('open_sesiuni')
    .select('id, data')
    .eq('curs', cursId)
  if (sErr) throw sErr
  const ids = (sessions ?? []).map((s) => s.id)
  if (ids.length === 0) return []

  const { data: reviews, error: rErr } = await supabase
    .from('feedback')
    .select('id, rating, detalii, nume, created, open_sesiune')
    .eq('tip', 'Review')
    .not('rating', 'is', null)
    .in('open_sesiune', ids)
    .order('created', { ascending: false })
  if (rErr) throw rErr

  const dateById = new Map((sessions ?? []).map((s) => [s.id, s.data]))
  const grouped = new Map<string, Review[]>()
  for (const r of reviews ?? []) {
    const sid = (r as { open_sesiune: string | null }).open_sesiune
    if (!sid) continue
    if (!grouped.has(sid)) grouped.set(sid, [])
    grouped.get(sid)!.push(r)
  }

  return [...grouped.entries()]
    .map(([sesiuneId, list]) => {
      const ratings = list
        .map((r) => r.rating)
        .filter((n): n is number => n != null)
      return {
        sesiuneId,
        data: dateById.get(sesiuneId) ?? null,
        avg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
        count: ratings.length,
        comments: list.filter((r) => r.detalii?.trim()),
      }
    })
    .sort((a, b) => (a.data && b.data ? b.data.localeCompare(a.data) : 0))
}
