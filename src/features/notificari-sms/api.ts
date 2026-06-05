import { supabase } from '@/lib/supabase'
import type { SituatieSms, InsertDto } from '@/types/db'

export const PAGE_SIZE = 25

export type SmsQueueParams = {
  status: string
  page: number
}

export type SmsQueueResult = {
  rows: SituatieSms[]
  total: number
}

export async function listSmsQueue({
  status,
  page,
}: SmsQueueParams): Promise<SmsQueueResult> {
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('situatie_sms_uri')
    .select('*', { count: 'exact' })
    .order('created', { ascending: false })
    .range(from, to)

  if (status) {
    query = query.eq('status', status as NonNullable<SituatieSms['status']>)
  }

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0 }
}

export async function createSmsQueueEntry(
  dto: InsertDto<'situatie_sms_uri'>,
): Promise<SituatieSms> {
  const { data, error } = await supabase
    .from('situatie_sms_uri')
    .insert(dto)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteSmsQueueEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('situatie_sms_uri')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export type ProcessResult = {
  total: number
  sent: number
  failed: number
  error?: string
}

export async function processSmsQueue(): Promise<ProcessResult> {
  const { data, error } = await supabase.functions.invoke('process-sms-queue', {
    body: {},
  })
  if (error) throw error
  return data as ProcessResult
}
