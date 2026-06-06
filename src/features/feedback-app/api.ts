import { supabase } from '@/lib/supabase'
import { applyWordSearch } from '@/lib/search'
import type {
  AppFeedback,
  AppFeedbackStatus,
  InsertDto,
  UpdateDto,
} from '@/types/db'

export const PAGE_SIZE = 25

export type AppFeedbackListParams = {
  search: string
  status: AppFeedbackStatus | ''
  page: number
}
export type AppFeedbackListResult = { rows: AppFeedback[]; total: number }

// RLS scopează automat: autorul își vede doar propriile rânduri, admin/owner văd tot.
export async function listAppFeedback({
  search,
  status,
  page,
}: AppFeedbackListParams): Promise<AppFeedbackListResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('app_feedback')
    .select('*', { count: 'exact' })
    .order('created', { ascending: false })
    .range(from, to)

  if (status) query = query.eq('status', status)

  query = applyWordSearch(query, search, ['titlu', 'detalii'])

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function getAppFeedback(id: string): Promise<AppFeedback | null> {
  const { data, error } = await supabase
    .from('app_feedback')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createAppFeedback(
  dto: InsertDto<'app_feedback'>,
): Promise<AppFeedback> {
  const { data, error } = await supabase
    .from('app_feedback')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateAppFeedback(
  id: string,
  dto: UpdateDto<'app_feedback'>,
): Promise<AppFeedback> {
  const { data, error } = await supabase
    .from('app_feedback')
    .update(dto)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteAppFeedback(id: string): Promise<void> {
  const { error } = await supabase.from('app_feedback').delete().eq('id', id)
  if (error) throw error
}
