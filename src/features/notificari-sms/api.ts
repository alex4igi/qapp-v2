import { supabase } from '@/lib/supabase'
import type { SituatieSms, InsertDto } from '@/types/db'
import type { SmsBulkCod, SmsRecipient, SmsRecipientMembru } from './templates'

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

// ============================================================
// Flux bulk plăți/restanțe (double-check)
// ============================================================

export type SmsRecipientsParams = {
  locatie?: string
  sezon?: string
  cod: SmsBulkCod
}

// Extrage destinatarii (familii) cu restanțe / activi, grupați pe telefon.
export async function getSmsRecipients({
  locatie,
  sezon,
  cod,
}: SmsRecipientsParams): Promise<SmsRecipient[]> {
  const { data, error } = await supabase.rpc('get_sms_recipients', {
    p_locatie: locatie || undefined,
    p_sezon: sezon || undefined,
    p_cod: cod,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({
    familia_id: r.familia_id,
    telefon: r.telefon ?? '',
    membri: (r.membri as unknown as SmsRecipientMembru[]) ?? [],
    total_restanta: Number(r.total_restanta ?? 0),
    zile_depasire: r.zile_depasire,
    client_ids: r.client_ids ?? [],
  }))
}

// Inserare în lot a SMS-urilor compuse în coadă (status 'De trimis').
export async function createSmsQueueBatch(
  rows: InsertDto<'situatie_sms_uri'>[],
): Promise<number> {
  if (rows.length === 0) return 0
  const { error } = await supabase.from('situatie_sms_uri').insert(rows)
  if (error) throw error
  return rows.length
}

// Clienții cărora li s-a programat deja un anumit cod de mesaj în luna curentă —
// folosit pentru pre-bifare (dedup), ca în v1 (Enabled = !Status).
export async function getClientiVizatiLunaCurenta(
  cod: SmsBulkCod,
): Promise<Set<string>> {
  const startLuna = new Date()
  startLuna.setDate(1)
  startLuna.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('situatie_sms_uri')
    .select('clienti_vizati')
    .eq('cod_mesaj', cod)
    .gte('created', startLuna.toISOString())
  if (error) throw error

  const set = new Set<string>()
  for (const row of data ?? []) {
    for (const id of row.clienti_vizati ?? []) set.add(id)
  }
  return set
}
